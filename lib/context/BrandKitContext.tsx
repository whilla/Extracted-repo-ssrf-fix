'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { BrandKit } from '@/lib/types';
import { loadBrandKit, saveBrandKit } from '@/lib/services/memoryService';

interface BrandKitContextType {
  brandKit: BrandKit | null;
  isLoading: boolean;
  error: string | null;
  updateBrandKit: (updates: Partial<BrandKit>) => Promise<void>;
  refreshBrandKit: () => Promise<void>;
}

const BrandKitContext = createContext<BrandKitContextType | null>(null);

const DEFAULT_BRAND_KIT: BrandKit = {
  brandName: '',
  niche: 'general',
  targetAudience: 'general audience',
  primaryColor: '#00f5ff',
  secondaryColor: '#7c3aed',
  tone: 'professional',
  uniqueSellingPoint: '',
  contentPillars: [],
  avoidTopics: [],
  language: 'en',
  hashtagStrategy: ['moderate'],
  contentPreferences: [],
};

export function BrandKitProvider({ children }: { children: ReactNode }) {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadKit = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const kit = await loadBrandKit();
      setBrandKit(kit || DEFAULT_BRAND_KIT);
    } catch (err) {
      console.error('Failed to load brand kit:', err);
      setError('Failed to load brand kit');
      setBrandKit(DEFAULT_BRAND_KIT);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadKit();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadKit]);

  const updateBrandKit = useCallback(async (updates: Partial<BrandKit>) => {
    try {
      const updated = { ...(brandKit || DEFAULT_BRAND_KIT), ...updates };
      await saveBrandKit(updated);
      setBrandKit(updated);
    } catch (err) {
      console.error('Failed to update brand kit:', err);
      throw err;
    }
  }, [brandKit]);

  const refreshBrandKit = useCallback(async () => {
    await loadKit();
  }, [loadKit]);

  return (
    <BrandKitContext.Provider
      value={{
        brandKit,
        isLoading,
        error,
        updateBrandKit,
        refreshBrandKit,
      }}
    >
      {children}
    </BrandKitContext.Provider>
  );
}

export function useBrandKit() {
  const context = useContext(BrandKitContext);
  if (!context) {
    // Return a safe default when used outside provider
    return {
      brandKit: null,
      isLoading: false,
      error: null,
      updateBrandKit: async () => {},
      refreshBrandKit: async () => {},
    };
  }
  return context;
}
