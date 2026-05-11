import { logger } from '@/lib/utils/logger';

export function safeAsync<T>(
  operation: () => Promise<T>,
  context: string,
  fallback: T
): Promise<T> {
  return operation().catch((error) => {
    logger.error(`[${context}]`, error);
    return fallback;
  });
}

export function safeAsyncVoid(
  operation: () => Promise<void>,
  context: string
): Promise<void> {
  return operation().catch((error) => {
    logger.error(`[${context}]`, error);
  });
}

export function safeSync<T>(
  operation: () => T,
  context: string,
  fallback: T
): T {
  try {
    return operation();
  } catch (error) {
    logger.error(`[${context}]`, String(error));
    return fallback;
  }
}

export function safeSyncVoid(
  operation: () => void,
  context: string
): void {
  try {
    operation();
  } catch (error) {
    logger.error(`[${context}]`, String(error));
  }
}
