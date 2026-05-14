'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface ApiLoadingContextType {
  loadingCount: number;
  startLoading: () => void;
  stopLoading: () => void;
  isLoading: boolean;
}

const ApiLoadingContext = createContext<ApiLoadingContextType | undefined>(undefined);

export function ApiLoadingProvider({ children }: { children: ReactNode }) {
  const [loadingCount, setLoadingCount] = useState(0);
  
  const startLoading = () => setLoadingCount((c) => c + 1);
  const stopLoading = () => setLoadingCount((c) => Math.max(0, c - 1));
  
  return (
    <ApiLoadingContext.Provider
      value={{ 
        loadingCount, 
        startLoading, 
        stopLoading, 
        isLoading: loadingCount > 0 
      }}
    >
      {children}
    </ApiLoadingContext.Provider>
  );
}

export function useApiLoading() {
  const context = useContext(ApiLoadingContext);
  if (!context) {
    throw new Error('useApiLoading must be used within an ApiLoadingProvider');
  }
  return context;
}
