'use client';

import { useApiLoading } from '@/context/ApiLoadingContext';
import { useCallback } from 'react';

export function useApi() {
  const { startLoading, stopLoading } = useApiLoading();
  
  const apiCall = useCallback(async <T,>(
    promise: Promise<T>,
    options?: { 
      showError?: boolean;
      errorMessage?: string;
      onSuccess?: (data: T) => void;
      onError?: (error: unknown) => void;
    }
  ): Promise<T | null> => {
    try {
      startLoading();
      const result = await promise;
      options?.onSuccess?.(result);
      return result;
    } catch (error) {
      console.error('API Error:', error);
      options?.onError?.(error);
      if (options?.showError !== false) {
        // You could add toast notifications here
        console.warn(options?.errorMessage || 'API request failed');
      }
      return null;
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);
  
  return { apiCall };
}
