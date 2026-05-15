// Puter.js Service Wrapper
// All Puter operations go through this service

import { encryptSensitiveData, decryptSensitiveData, markAsEncrypted, isEncrypted, extractCiphertext } from '../utils/crypto.ts';

const PUTER_READY_TIMEOUT = 4000;
const PUTER_AUTH_TIMEOUT = 30000;
const PUTER_AUTH_POLL_INTERVAL = 500;
// Puter.js is loaded from CDN without SRI since the hash changes frequently.
// Regenerate SRI with: curl https://js.puter.com/v2/ 2>/dev/null | openssl dgst -sha384 -binary | openssl enc -base64 -A
// Set PUTER_SCRIPT_SRI env var to enable SRI validation, or leave empty to skip.
const PUTER_SCRIPT_URL = 'https://js.puter.com/v2';
const PUTER_SCRIPT_SRI = process.env.PUTER_SCRIPT_SRI || '';
const LOCAL_KV_PREFIX = 'nexus:kv:';
const LOCAL_SECRET_PREFIX = 'nexus:secret:';
const LOCAL_FILE_PREFIX = 'nexus:file:';
const LOCAL_AUTH_KEY = 'nexus:auth:user';
const LOCAL_AUTH_SESSION_KEY = 'nexus:auth:session';
const MAX_LOCAL_BINARY_MIRROR_BYTES = 750000;
const MAX_LOCAL_BINARY_MIRROR_CHARS = 1200000;
const SENSITIVE_KV_KEY_PATTERN = /(?:^|[-_])(key|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|credential)(?:$|[-_])/i;
const SAFE_LOCAL_KV_KEYS = new Set([
  'ai_model',
  'default_model',
  'disable_puter_fallback',
  'image_provider',
  'video_provider',
  'onboarding_complete',
  'local_user_id',
  'linkinbio_config',
  'favorite_hashtags',
  'saved_trends',
  'watermark_config',
]);
const SAFE_LOCAL_KV_PREFIXES = [
  'provider_status_',
  'posts_count_',
  'usage_',
  'usage_total_',
  'best_times_',
  'music_',
];
let puterScriptPromise: Promise<boolean> | null = null;

export interface PuterAuthDiagnostics {
  scriptPresent: boolean;
  sdkReady: boolean;
  authDialogAvailable: boolean;
  cachedSession: boolean;
  signedIn: boolean;
  userPresent: boolean;
}

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isQuotaExceededError(error: unknown): boolean {
  const candidate = error as { name?: string; code?: number; message?: string };
  return (
    candidate?.name === 'QuotaExceededError' ||
    candidate?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate?.code === 22 ||
    candidate?.code === 1014 ||
    /quota|storage|space/i.test(candidate?.message || String(error))
  );
}

export function pruneOversizedLocalFileMirrors(maxChars = MAX_LOCAL_BINARY_MIRROR_CHARS): number {
  if (!hasLocalStorage()) return 0;

  let removed = 0;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(LOCAL_FILE_PREFIX)) continue;

    const value = window.localStorage.getItem(key);
    if (!value) continue;

    const isMediaAsset = key.includes('/content/assets/');
    const isInlineMedia = /^data:(?:audio|video|image)\//i.test(value);
    if ((isMediaAsset && isInlineMedia) || value.length > maxChars) {
      window.localStorage.removeItem(key);
      removed += 1;
    }
  }

  return removed;
}

function setLocalStorageWithQuotaRecovery(key: string, value: string): boolean {
  if (!hasLocalStorage()) return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    window.localStorage.removeItem(key);
    pruneOversizedLocalFileMirrors();

    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (retryError) {
      if (!isQuotaExceededError(retryError)) {
        throw retryError;
      }
      console.warn('[PuterService] Local storage quota is full; skipped local mirror for', key);
      return false;
    }
  }
}

export function isSensitiveKvKey(key: string): boolean {
  return SENSITIVE_KV_KEY_PATTERN.test(key);
}

export function canMirrorKvToLocalStorage(key: string): boolean {
  if (isSensitiveKvKey(key)) {
    return false;
  }

  if (SAFE_LOCAL_KV_KEYS.has(key)) {
    return true;
  }

  return SAFE_LOCAL_KV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function localKvKey(key: string): string {
  return `${LOCAL_KV_PREFIX}${key}`;
}

function localSecretKey(key: string): string {
  return `${LOCAL_SECRET_PREFIX}${key}`;
}

function serializeKvValue(key: string, value: unknown): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof raw !== 'string') {
    throw new Error(`kvSet(${key}) rejected undefined value`);
  }

  if (!isSensitiveKvKey(key)) {
    return raw;
  }

  return raw
    .trim()
    .replace(/[\r\n]+/g, '')
    .slice(0, 4096);
}

function localFileKey(path: string): string {
  return `${LOCAL_FILE_PREFIX}${path.startsWith('/') ? path : `${BASE_PATH()}/${path}`}`;
}

function getCachedUser(): { username: string } | null {
  if (!hasLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getCachedAuthUser(): { username: string } | null {
  return getCachedUser();
}

export function hasCachedAuthSession(): boolean {
  if (!hasLocalStorage()) return false;

  try {
    return window.localStorage.getItem(LOCAL_AUTH_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function cacheUser(user: { username: string } | null): void {
  if (!hasLocalStorage()) return;

  try {
    if (user) {
      window.localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(user));
      window.localStorage.setItem(LOCAL_AUTH_SESSION_KEY, 'true');
    } else {
      window.localStorage.removeItem(LOCAL_AUTH_KEY);
      window.localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
    }
  } catch {
    // Ignore local storage failures
  }
}

export function clearCachedAuth(): void {
  cacheUser(null);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPuterPopupFeatures(): string {
  const width = 600;
  const height = 700;
  const left = Math.max(0, Math.round(window.screen.width / 2 - width / 2));
  const top = Math.max(0, Math.round(window.screen.height / 2 - height / 2));

  return [
    'toolbar=no',
    'location=no',
    'directories=no',
    'status=no',
    'menubar=no',
    'scrollbars=no',
    'resizable=no',
    'copyhistory=no',
    `width=${width}`,
    `height=${height}`,
    `top=${top}`,
    `left=${left}`,
  ].join(', ');
}

async function signInThroughManagedPopup(): Promise<void> {
  if (typeof window === 'undefined' || !window.puter) {
    throw new Error('Puter not available');
  }

  const puterClient = window.puter as typeof window.puter & {
    defaultGUIOrigin?: string;
    setAuthToken?: (token: string) => void;
    setAppID?: (appId: string) => void;
  };

  const guiOrigin = puterClient.defaultGUIOrigin || 'https://puter.com';
  const messageId = Math.floor(Date.now() + Math.random() * 1000);
  const openerOrigin = encodeURIComponent(window.location.origin);
  const popupUrl = `${guiOrigin}/action/sign-in?embedded_in_popup=true&msg_id=${messageId}&opener_origin=${openerOrigin}${window.crossOriginIsolated ? '&cross_origin_isolated=true' : ''}`;
  const popup = window.open(popupUrl, 'Puter', buildPuterPopupFeatures());

  if (!popup) {
    throw new Error('Popup blocked. Allow popups for this site and tap Connect Puter again.');
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closeWatcher);
      clearTimeout(timeoutHandle);
    };

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== guiOrigin) return;

      const data = event.data as {
        msg?: string;
        msg_id?: number;
        token?: string;
        app_uid?: string;
        success?: boolean;
        error?: string;
        username?: string;
      } | null;

      if (!data) return;

      if (data.msg_id !== messageId) return;

      if (data.success && data.token) {
        puterClient.setAuthToken?.(data.token);
        if (data.app_uid) {
          puterClient.setAppID?.(data.app_uid);
        }
        finishResolve();
        return;
      }

      finishReject(new Error(data.error || 'Puter authentication failed.'));
    };

    const closeWatcher = window.setInterval(() => {
      if (popup.closed) {
        finishReject(new Error('Authentication window was closed before sign-in completed.'));
      }
    }, 250);

    const timeoutHandle = window.setTimeout(() => {
      finishReject(new Error('Puter auth timed out before a user session became available.'));
    }, PUTER_AUTH_TIMEOUT);

    window.addEventListener('message', onMessage);
  });
}

async function readAuthenticatedUser(): Promise<{ username: string } | null> {
  if (typeof window === 'undefined' || !window.puter) return null;

  const signedIn = await window.puter.auth.isSignedIn().catch(() => false);
  if (!signedIn) return null;

  return await window.puter.auth.getUser().catch(() => null);
}

function ensurePuterScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.puter) return Promise.resolve(true);
  if (puterScriptPromise) return puterScriptPromise;

  const loadPromise = new Promise<boolean>((resolve) => {
    const existingScript = document.querySelector(`script[src="${PUTER_SCRIPT_URL}"]`) as HTMLScriptElement | null;

    if (existingScript) {
      if (window.puter) {
        resolve(true);
        return;
      }

      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      existingScript.addEventListener('load', () => {
        if (window.puter) {
          finish(true);
          return;
        }

        window.setTimeout(() => finish(!!window.puter), 100);
      }, { once: true });
      existingScript.addEventListener('error', () => finish(false), { once: true });
      setTimeout(() => finish(!!window.puter), PUTER_READY_TIMEOUT);
      return;
    }

    const script = document.createElement('script');
    script.src = PUTER_SCRIPT_URL;
    script.async = true;
    // SECURITY: Use SRI hash when available for script integrity verification
    // Note: Update this hash when the Puter CDN version changes
    if (PUTER_SCRIPT_SRI) {
      script.integrity = PUTER_SCRIPT_SRI;
    }
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.puter) {
        resolve(true);
        return;
      }

      window.setTimeout(() => resolve(!!window.puter), 100);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  }).finally(() => {
    puterScriptPromise = null;
  });

  puterScriptPromise = loadPromise;
  return loadPromise;
}

// Wait for Puter to be available
export async function waitForPuter(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  // If already available, return immediately
  if (window.puter) return true;
  await ensurePuterScript();
  
  const start = Date.now();
  
  return new Promise((resolve) => {
    const check = () => {
      if (window.puter) {
        resolve(true);
        return;
      }
      
      if (Date.now() - start >= PUTER_READY_TIMEOUT) {
        console.log('[v0] Puter.js load timeout after', PUTER_READY_TIMEOUT, 'ms');
        resolve(false);
        return;
      }
      
      setTimeout(check, 100);
    };
    
    check();
  });
}

// Check if Puter is available
export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.puter;
}

export async function getPuterAuthDiagnostics(): Promise<PuterAuthDiagnostics> {
  if (typeof window === 'undefined') {
    return {
      scriptPresent: false,
      sdkReady: false,
      authDialogAvailable: false,
      cachedSession: false,
      signedIn: false,
      userPresent: false,
    };
  }

  const scriptPresent = !!document.querySelector(`script[src="${PUTER_SCRIPT_URL}"]`);
  const sdkReady = !!window.puter;
  const authDialogAvailable = typeof window.puter?.ui?.authenticateWithPuter === 'function';
  const cachedSession = hasCachedAuthSession();

  let signedIn = false;
  let userPresent = false;

  if (sdkReady) {
    try {
      signedIn = await window.puter.auth.isSignedIn();
      if (signedIn) {
        userPresent = !!(await window.puter.auth.getUser());
      }
    } catch {
      signedIn = false;
      userPresent = false;
    }
  }

  return {
    scriptPresent,
    sdkReady,
    authDialogAvailable,
    cachedSession,
    signedIn,
    userPresent,
  };
}

// Authentication
export async function signIn(): Promise<{ username: string } | null> {
  if (typeof window === 'undefined') {
    throw new Error('Window not available');
  }

  if (!window.puter) {
    const ready = await waitForPuter();
    if (!ready || !window.puter) {
      throw new Error('Puter not available');
    }
  }

  let resolvedUser: { username: string } | null = null;
  const authAction = async () => {
    let popupError: Error | null = null;

    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
      try {
        await signInThroughManagedPopup();
        const popupUser = await readAuthenticatedUser();
        if (popupUser) {
          resolvedUser = popupUser;
          return;
        }
      } catch (error) {
        popupError = error instanceof Error ? error : new Error('Managed Puter popup failed.');
        console.warn('Managed Puter popup failed, falling back to SDK auth:', popupError);
      }
    }

    if (typeof window.puter.ui?.authenticateWithPuter === 'function') {
      try {
        await window.puter.ui.authenticateWithPuter();
        const userAfterDialog = await readAuthenticatedUser();
        if (userAfterDialog) {
          resolvedUser = userAfterDialog;
          return;
        }
      } catch (error) {
        console.warn('Puter dialog auth failed, falling back to auth.signIn():', error);
      }
    }

    const maybeUser = await window.puter.auth.signIn();
    if (maybeUser?.username) {
      resolvedUser = maybeUser;
      return;
    }

    if (popupError) {
      throw popupError;
    }
  };

  let authError: unknown = null;
  const authAttempt = authAction().catch((error) => {
    authError = error;
  });

  const deadline = Date.now() + PUTER_AUTH_TIMEOUT;

  while (Date.now() < deadline) {
    if (resolvedUser) {
      cacheUser(resolvedUser);
      return resolvedUser;
    }

    const user = await readAuthenticatedUser();
    if (user) {
      cacheUser(user);
      return user;
    }

    if (authError) {
      break;
    }

    await Promise.race([authAttempt, sleep(PUTER_AUTH_POLL_INTERVAL)]);
  }

  await Promise.race([authAttempt, sleep(1000)]);

  if (resolvedUser) {
    cacheUser(resolvedUser);
    return resolvedUser;
  }

  const finalUser = await readAuthenticatedUser();
  if (finalUser) {
    cacheUser(finalUser);
    return finalUser;
  }

  clearCachedAuth();

  if (authError instanceof Error) {
    console.error('Puter signIn error:', authError);
    throw authError;
  }

  const timeoutError = new Error('Puter auth timed out before a user session became available');
  console.error('Puter signIn error:', timeoutError);
  throw timeoutError;
}

export async function signOut(): Promise<void> {
  try {
    if (!isPuterAvailable()) return;
    await window.puter.auth.signOut();
  } catch (error) {
    console.error('Puter signOut error:', error);
  } finally {
    cacheUser(null);
  }
}

export async function getUser(): Promise<{ username: string } | null> {
  try {
    const ready = await waitForPuter();
    if (!ready) return getCachedUser();
    
    const user = await window.puter.auth.getUser();
    cacheUser(user);
    return user;
  } catch (error) {
    console.error('Puter getUser error:', error);
    return getCachedUser();
  }
}

export async function isSignedIn(): Promise<boolean> {
  try {
    const ready = await waitForPuter();
    if (!ready) return false;
    
    const signedIn = await window.puter.auth.isSignedIn();
    if (!signedIn) {
      clearCachedAuth();
    }
    return signedIn;
  } catch (error) {
    console.error('Puter isSignedIn error:', error);
    return false;
  }
}

// Key-Value Store
export async function kvSet(key: string, value: unknown): Promise<boolean> {
  try {
    let stringValue = serializeKvValue(key, value);
    const sensitive = isSensitiveKvKey(key);

    // SECURITY FIX: Encrypt sensitive keys before storing
    if (sensitive) {
      try {
        const encrypted = await encryptSensitiveData(stringValue);
        stringValue = markAsEncrypted(encrypted);
      } catch (error) {
        console.error('[PuterService] Encryption failed for key:', key, error);
        // Fall back to storing unencrypted if encryption fails
      }
    }

    if (hasLocalStorage()) {
      if (sensitive) {
        window.localStorage.removeItem(localKvKey(key));
        if (isEncrypted(stringValue)) {
          window.localStorage.setItem(localSecretKey(key), stringValue);
        } else {
          window.localStorage.removeItem(localSecretKey(key));
        }
      } else if (canMirrorKvToLocalStorage(key)) {
        window.localStorage.setItem(localKvKey(key), stringValue);
        window.localStorage.removeItem(localSecretKey(key));
      } else {
        window.localStorage.removeItem(localKvKey(key));
        window.localStorage.removeItem(localSecretKey(key));
      }
    }
    if (isPuterAvailable() && hasCachedAuthSession()) {
      await window.puter.kv.set(key, stringValue);
    }
    return true;
  } catch (error) {
    console.error('Puter kv.set error:', error);
    return hasLocalStorage();
  }
}

export async function kvGet<T = string>(key: string, parse = false): Promise<T | null> {
  try {
    let value: string | null = null;
    const sensitive = isSensitiveKvKey(key);

    if (sensitive && hasLocalStorage()) {
      value = window.localStorage.getItem(localSecretKey(key));
    }

    if (value === null && isPuterAvailable() && (!sensitive || hasCachedAuthSession())) {
      value = await window.puter.kv.get(key);
      if (sensitive && value && hasLocalStorage() && isEncrypted(value)) {
        window.localStorage.setItem(localSecretKey(key), value);
      }
    }

    if (value === null && hasLocalStorage() && canMirrorKvToLocalStorage(key)) {
      value = window.localStorage.getItem(localKvKey(key));
    }

    if (value === null) return null;

    // SECURITY FIX: Decrypt sensitive keys if encrypted
    if (isEncrypted(value)) {
      try {
        const ciphertext = extractCiphertext(value);
        value = await decryptSensitiveData(ciphertext);
      } catch (error) {
        console.error('[PuterService] Decryption failed for key:', key, error);
        // Return null if decryption fails (data may be corrupted)
        return null;
      }
    }
    
    if (parse) {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    }
    
    return value as unknown as T;
  } catch (error) {
    console.error('Puter kv.get error:', error);
    return null;
  }
}

export async function kvDelete(key: string): Promise<boolean> {
  try {
    if (hasLocalStorage()) {
      window.localStorage.removeItem(localKvKey(key));
      window.localStorage.removeItem(localSecretKey(key));
    }
    if (isPuterAvailable() && hasCachedAuthSession()) {
      await window.puter.kv.del(key);
    }
    return true;
  } catch (error) {
    console.error('Puter kv.del error:', error);
    return hasLocalStorage();
  }
}

export async function kvList(): Promise<string[]> {
  try {
    const keys = new Set<string>();

    if (isPuterAvailable() && hasCachedAuthSession()) {
      (await window.puter.kv.list()).forEach(key => keys.add(key));
    }

    if (hasLocalStorage()) {
      Object.keys(window.localStorage)
        .filter(key => key.startsWith(LOCAL_KV_PREFIX))
        .forEach(key => keys.add(key.replace(LOCAL_KV_PREFIX, '')));
    }

    return Array.from(keys);
  } catch (error) {
    console.error('Puter kv.list error:', error);
    return [];
  }
}

// File System
/**
 * Get the base path for Puter file storage
 * Configurable via env or defaults to /NexusAI
 */
function getBasePath(): string {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const stored = window.localStorage.getItem('nexus:config:base-path');
      if (stored) return stored;
    } catch {
      // Fall through to default
    }
  }
  return process.env.NEXT_PUBLIC_PUTER_BASE_PATH || '/NexusAI';
}

/**
 * Set the base path for Puter file storage
 */
export function setBasePath(path: string): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem('nexus:config:base-path', path);
    } catch {
      console.warn('[PuterService] Failed to persist base path configuration');
    }
  }
}

let cachedBasePath: string | null = null;
function BASE_PATH(): string {
  if (!cachedBasePath) {
    cachedBasePath = getBasePath();
  }
  return cachedBasePath;
}

async function ensureDir(path: string): Promise<void> {
  // BUG FIX #1: Add null check for window.puter
  if (typeof window === 'undefined') {
    throw new Error('ensureDir: window object not available');
  }
  
  if (!window.puter) {
    throw new Error('ensureDir: Puter not initialized. Ensure Puter.js has loaded.');
  }
  
  if (!window.puter.fs) {
    throw new Error('ensureDir: Puter filesystem not available');
  }

  try {
    const exists = await window.puter.fs.exists(path);
    if (!exists) {
      await window.puter.fs.mkdir(path);
    }
  } catch (error) {
    // Directory might already exist or parent doesn't exist
    // Try to create it anyway
    try {
      await window.puter.fs.mkdir(path);
    } catch (mkdirError) {
      console.error(`[ensureDir] Failed to ensure directory ${path}:`, mkdirError);
      // Ignore if already exists, but log the error
      if (String(mkdirError).includes('EEXIST')) {
        return; // Directory already exists, that's fine
      }
      throw mkdirError;
    }
  }
}

export async function initFileSystem(): Promise<void> {
  if (!isPuterAvailable()) return;
  
  const bp = BASE_PATH();
  const dirs = [
    bp,
    `${bp}/brand`,
    `${bp}/content`,
    `${bp}/content/assets`,
    `${bp}/content/drafts`,
    `${bp}/content/published`,
    `${bp}/content/templates`,
    `${bp}/skills`,
    `${bp}/analytics`,
    `${bp}/system`,
    `${bp}/system/chat-history`,
  ];
  
  for (const dir of dirs) {
    await ensureDir(dir);
  }
}

export async function writeFile(path: string, content: unknown): Promise<boolean> {
  const bp = BASE_PATH();
  const fullPath = path.startsWith('/') ? path : `${bp}/${path}`;
  const stringContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  let localSaved = false;
  
  try {
    if (hasLocalStorage()) {
      localSaved = setLocalStorageWithQuotaRecovery(localFileKey(fullPath), stringContent);
    }

    if (!isPuterAvailable() || !hasCachedAuthSession()) {
      return localSaved;
    }

    // Ensure parent directories exist
    const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentPath) {
      await ensureDirectoryPath(parentPath);
    }
    
    await window.puter.fs.write(fullPath, stringContent, { createMissingParents: true });
    return true;
  } catch (error: unknown) {
    // Silently handle expected errors during first write
    const errorStr = String(error);
    if (errorStr.includes('404') || errorStr.includes('not found') || errorStr.includes('subject_does_not_exist')) {
      // Try again after creating base path
      try {
        await initFileSystem();
        await window.puter.fs.write(fullPath, stringContent, { createMissingParents: true });
        return true;
      } catch {
        // Still failed - this is okay for new users, files will be created on next save
        return localSaved;
      }
    }
    // Only log unexpected errors
    console.error('Puter fs.write error:', error);
    return localSaved;
  }
}

export async function saveFile(path: string, content: unknown): Promise<boolean> {
  return writeFile(path, content);
}

export async function writeBinaryFile(path: string, blob: Blob): Promise<boolean> {
  const bp = BASE_PATH();
  const fullPath = path.startsWith('/') ? path : `${bp}/${path}`;
  let localSaved = false;

  try {
    if (hasLocalStorage()) {
      if (blob.size <= MAX_LOCAL_BINARY_MIRROR_BYTES) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onerror = () => reject(reader.error || new Error('Failed to serialize blob'));
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.readAsDataURL(blob);
        });
        localSaved = setLocalStorageWithQuotaRecovery(localFileKey(fullPath), dataUrl);
      } else {
        pruneOversizedLocalFileMirrors();
      }
    }

    if (!isPuterAvailable() || !hasCachedAuthSession()) {
      return localSaved;
    }

    const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentPath) {
      await ensureDirectoryPath(parentPath);
    }

    await window.puter.fs.write(fullPath, blob, { createMissingParents: true });
    return true;
  } catch (error: unknown) {
    const errorStr = String(error);
    if (errorStr.includes('404') || errorStr.includes('not found') || errorStr.includes('subject_does_not_exist')) {
      try {
        await initFileSystem();
        await window.puter.fs.write(fullPath, blob, { createMissingParents: true });
        return true;
      } catch {
        return localSaved;
      }
    }
    console.error('Puter fs.write(binary) error:', error);
    return localSaved;
  }
}

// Recursively ensure all directories in a path exist
async function ensureDirectoryPath(path: string): Promise<void> {
  if (!isPuterAvailable() || !path || path === '/') return;
  
  const parts = path.split('/').filter(Boolean);
  let currentPath = '';
  
  for (const part of parts) {
    currentPath += '/' + part;
    await ensureDir(currentPath);
  }
}

export async function readFile<T = string>(path: string, parse = false): Promise<T | null> {
  const parseText = (text: string): T => {
    if (parse) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    return text as unknown as T;
  };

  try {
    const bp = BASE_PATH();
    const fullPath = path.startsWith('/') ? path : `${bp}/${path}`;
    let text: string | null = null;
    let puterReadError: unknown = null;

    if (isPuterAvailable() && hasCachedAuthSession()) {
      try {
        const blob = await window.puter.fs.read(fullPath);
        text = await blob.text();
        if (hasLocalStorage()) {
          setLocalStorageWithQuotaRecovery(localFileKey(fullPath), text);
        }
      } catch (error) {
        puterReadError = error;
      }
    }

    if (text === null && hasLocalStorage()) {
      text = window.localStorage.getItem(localFileKey(fullPath));
    }

    if (text === null) return null;

    if (puterReadError) {
      const errorStr = String(puterReadError);
      const errorObj = puterReadError as { code?: string };
      const expectedPuterMiss =
        errorStr.includes('not found') ||
        errorStr.includes('ENOENT') ||
        errorStr.includes('subject_does_not_exist') ||
        errorObj?.code === 'subject_does_not_exist';
      if (!expectedPuterMiss) {
        console.warn('Puter fs.read failed; using local persisted copy:', puterReadError);
      }
    }

    return parseText(text);
  } catch (error: unknown) {
    // File doesn't exist is a normal case for new users - don't log these
    const errorStr = String(error);
    const errorObj = error as { code?: string };
    if (
      errorStr.includes('not found') || 
      errorStr.includes('ENOENT') ||
      errorStr.includes('subject_does_not_exist') ||
      errorObj?.code === 'subject_does_not_exist'
    ) {
      return null;
    }
    console.error('Puter fs.read error:', error);
    return null;
  }
}

export async function readBinaryFile(path: string): Promise<Blob | null> {
  try {
    const bp = BASE_PATH();
    const fullPath = path.startsWith('/') ? path : `${bp}/${path}`;

    if (isPuterAvailable() && hasCachedAuthSession()) {
      const blob = await window.puter.fs.read(fullPath);
      return blob;
    }

    if (hasLocalStorage()) {
      const dataUrl = window.localStorage.getItem(localFileKey(fullPath));
      if (!dataUrl) return null;
      const response = await fetch(dataUrl);
      return await response.blob();
    }

    return null;
  } catch (error: unknown) {
    const errorStr = String(error);
    const errorObj = error as { code?: string };
    if (
      errorStr.includes('not found') ||
      errorStr.includes('ENOENT') ||
      errorStr.includes('subject_does_not_exist') ||
      errorObj?.code === 'subject_does_not_exist'
    ) {
      return null;
    }
    console.error('Puter fs.read(binary) error:', error);
    return null;
  }
}

export async function getFileReadUrl(path: string): Promise<string | null> {
  try {
    const bp = BASE_PATH();
    const fullPath = path.startsWith('/') ? path : `${bp}/${path}`;

    if (isPuterAvailable() && hasCachedAuthSession()) {
      const getReadURL = window.puter.fs.getReadURL;
      if (typeof getReadURL === 'function') {
        return await getReadURL(fullPath);
      }

      const blob = await window.puter.fs.read(fullPath);
      return URL.createObjectURL(blob);
    }

    if (hasLocalStorage()) {
      return window.localStorage.getItem(localFileKey(fullPath));
    }

    return null;
  } catch (error) {
    console.error('Puter fs.getReadURL error:', error);
    return null;
  }
}

export async function deleteFile(path: string): Promise<boolean> {
  try {
    const bp = BASE_PATH();
    const fullPath = path.startsWith('/') ? path : `${bp}/${path}`;
    if (hasLocalStorage()) {
      window.localStorage.removeItem(localFileKey(fullPath));
    }
    if (isPuterAvailable() && hasCachedAuthSession()) {
      await window.puter.fs.delete(fullPath);
    }
    return true;
  } catch (error) {
    console.error('Puter fs.delete error:', error);
    return hasLocalStorage();
  }
}

export async function listFiles(path: string): Promise<{ name: string; is_dir: boolean }[]> {
  try {
    const bp = BASE_PATH();
    const fullPath = path.startsWith('/') ? path : `${bp}/${path}`;
    const files = new Map<string, { name: string; is_dir: boolean }>();

    if (isPuterAvailable() && hasCachedAuthSession()) {
      (await window.puter.fs.readdir(fullPath)).forEach(file => files.set(file.name, file));
    }

    if (hasLocalStorage()) {
      Object.keys(window.localStorage)
        .filter(key => key.startsWith(LOCAL_FILE_PREFIX))
        .map(key => key.replace(LOCAL_FILE_PREFIX, ''))
        .filter(storedPath => storedPath.startsWith(`${fullPath}/`))
        .forEach(storedPath => {
          const remainder = storedPath.slice(fullPath.length + 1);
          if (!remainder || remainder.includes('/')) return;
          files.set(remainder, { name: remainder, is_dir: false });
        });
    }

    return Array.from(files.values());
  } catch (error: unknown) {
    // Directory not existing is expected for new users - only log if it's a different error
    const errorObj = error as { code?: string };
    if (errorObj?.code !== 'subject_does_not_exist') {
      console.error('Puter fs.readdir error:', error);
    }
    return [];
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const fullPath = path.startsWith('/') ? path : `${BASE_PATH}/${path}`;
    if (isPuterAvailable() && hasCachedAuthSession()) {
      return await window.puter.fs.exists(fullPath);
    }
    return hasLocalStorage() && window.localStorage.getItem(localFileKey(fullPath)) !== null;
  } catch (error) {
    console.error('Puter fs.exists error:', error);
    return false;
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Convenience paths - computed at runtime
export function getPaths() {
  const bp = BASE_PATH();
  return {
    base: bp,
    brandKit: `${bp}/brand/brandkit.json`,
    voice: `${bp}/brand/voice.json`,
    niche: `${bp}/brand/niche.json`,
    assets: `${bp}/content/assets`,
    drafts: `${bp}/content/drafts`,
    published: `${bp}/content/published`,
    templates: `${bp}/content/templates`,
    skills: `${bp}/skills`,
    analytics: `${bp}/analytics`,
    chatHistory: `${bp}/system/chat-history`,
    schedule: `${bp}/system/schedule.json`,
    settings: `${bp}/system/settings`,
    system: `${bp}/system`,
  };
}

// Legacy export for backward compatibility
export const PATHS = getPaths();

export const puterService = {
  waitForPuter,
  isPuterAvailable,
  signIn,
  signOut,
  clearCachedAuth,
  getUser,
  isSignedIn,
  kvSet,
  kvGet,
  kvDelete,
  kvList,
  initFileSystem,
  writeFile,
  saveFile,
  writeBinaryFile,
  readFile,
  readBinaryFile,
  getFileReadUrl,
  deleteFile,
  listFiles,
  fileExists,
  generateId,
  PATHS,
};
