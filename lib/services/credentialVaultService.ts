'use client';

import { kvGet, kvSet } from './puterService';
import { encryptSensitiveData, decryptSensitiveData, markAsEncrypted, isEncrypted, extractCiphertext } from '../utils/crypto';
import { sanitizeApiKey } from './providerCredentialUtils';

export interface SecretCredential {
  key: string;
  value: string;
  platform: string;
  category: 'API_KEY' | 'ACCESS_TOKEN' | 'SECRET' | 'CLIENT_ID';
}

/**
 * CredentialVaultService
 * Handles the secure storage and retrieval of platform secrets.
 * Implements AES-GCM encryption for all stored values.
 */
export class CredentialVaultService {
  
  /**
   * Securely stores a credential.
   * @param key The unique identifier for the secret (e.g., 'shopify_access_token')
   * @param value The plain-text secret value
   */
  static async setSecret(key: string, value: string): Promise<void> {
    try {
      // 1. Sanitize input
      const sanitizedValue = value.trim();
      
      // 2. Encrypt data using AES-GCM
      const encrypted = await encryptSensitiveData(sanitizedValue);
      const finalValue = markAsEncrypted(encrypted);
      
      // 3. Persist to Puter KV
      await kvSet(key, finalValue);
    } catch (error) {
      console.error(`[Vault] Failed to secure secret ${key}:`, error);
      throw new Error('Encryption failed. Secret was not stored.');
    }
  }

  /**
   * Retrieves and decrypts a credential.
   * @param key The identifier for the secret
   */
  static async getSecret(key: string): Promise<string | null> {
    try {
      const value = await kvGet(key);
      if (!value) return null;

      // Check if the value is marked as encrypted
      if (isEncrypted(value)) {
        const ciphertext = extractCiphertext(value);
        return await decryptSensitiveData(ciphertext);
      }

      // If it's not encrypted, we treat it as a legacy secret and return it,
      // but we should flag it for migration to SEC_V2.
      return value;
    } catch (error) {
      console.error(`[Vault] Decryption failed for ${key}:`, error);
      return null;
    }
  }

  /**
   * Retrieves all secrets for a specific group (e.g., 'social', 'ecommerce')
   * @param group The platform group to filter by
   * @param allSecrets List of all potential secret keys to check
   */
  static async getSecretsByGroup(group: string, allSecrets: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    // We filter the provided list of all possible keys by the group
    // (This list is typically defined in the platform configuration)
    const groupKeys = allSecrets.filter(k => k.includes(group) || this.isKeyInGroup(k, group));
    
    await Promise.all(
      groupKeys.map(async (key) => {
        const val = await this.getSecret(key);
        if (val) results[key] = val;
      })
    );
    
    return results;
  }

  private static isKeyInGroup(key: string, group: string): boolean {
    const groups: Record<string, string[]> = {
      social: ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'threads'],
      ecommerce: ['shopify', 'amazon', 'etsy'],
      newsletter: ['mailchimp', 'klaviyo', 'convertkit'],
      blogging: ['wordpress', 'medium', 'ghost'],
    };
    
    const platformList = groups[group as keyof typeof groups] || [];
    return platformList.some(p => key.toLowerCase().includes(p));
  }

  /**
   * Clears a specific secret from the vault
   */
  static async deleteSecret(key: string): Promise<void> {
    await kvSet(key, ''); // Or use kvDelete if available in puterService
  }
}
