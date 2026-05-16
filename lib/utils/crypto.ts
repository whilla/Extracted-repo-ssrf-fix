// Isomorphic encryption utility for sensitive data.
// Uses Web Crypto AES-GCM in browsers and Node 20+.

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const TAG_LENGTH = 128;
const SALT = new TextEncoder().encode('nexusai-salt-v1'); // Use consistent salt for key derivation

function getCrypto(): Crypto {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new Error('Web Crypto API is not available in this runtime');
  }
  return cryptoImpl;
}

function getKeyMaterial(): string {
  if (typeof window !== 'undefined') {
    return `nexusai-${window.location.hostname}`;
  }

  return (
    process.env.MASTER_SECRET ||
    process.env.NEXUS_CRYPTO_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'nexusai-development-server-secret'
  );
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

/**
 * Derives a consistent key from the browser's origin/fingerprint
 * This allows the same data to be decrypted across tabs/windows
 */
async function deriveKey(): Promise<CryptoKey> {
  try {
    const cryptoImpl = getCrypto();
    // Use a combination of factors for the key material
    const material = new TextEncoder().encode(getKeyMaterial());

    const keyMaterial = await cryptoImpl.subtle.importKey(
      'raw',
      material,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    return cryptoImpl.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: SALT,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('[Crypto] Key derivation failed:', error);
    throw error;
  }
}

/**
 * Encrypts sensitive data using AES-GCM
 */
export async function encryptSensitiveData(plaintext: string): Promise<string> {
  try {
    const cryptoImpl = getCrypto();
    const key = await deriveKey();
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(plaintext);

    const encryptedData = await cryptoImpl.subtle.encrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      encodedText
    );

    // Combine IV + encrypted data, encode as base64
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);

    return encodeBase64(combined);
  } catch (error) {
    console.error('[Crypto] Encryption failed:', error);
    throw error;
  }
}

/**
 * Decrypts sensitive data encrypted with encryptSensitiveData
 */
export async function decryptSensitiveData(encrypted: string): Promise<string> {
  try {
    const cryptoImpl = getCrypto();
    const key = await deriveKey();
    const combined = decodeBase64(encrypted);

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    const decryptedData = await cryptoImpl.subtle.decrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      encryptedData
    );

    return new TextDecoder().decode(decryptedData);
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error);
    throw error;
  }
}

/**
 * Marks data as encrypted with a prefix for identification
 */
export function markAsEncrypted(ciphertext: string): string {
  return `encrypted:v1:${ciphertext}`;
}

/**
 * Checks if data is marked as encrypted
 */
export function isEncrypted(data: unknown): boolean {
  return typeof data === 'string' && data.startsWith('encrypted:v1:');
}

/**
 * Extracts the ciphertext from encrypted data
 */
export function extractCiphertext(encryptedData: string): string {
  return encryptedData.replace(/^encrypted:v1:/, '');
}
