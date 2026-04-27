'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { signIn, signOut, getUser, isSignedIn, getCachedAuthUser, hasCachedAuthSession, clearCachedAuth } from '@/lib/services/puterService';
import { initMemory, isOnboardingComplete, loadBrandKit } from '@/lib/services/memoryService';
import type { BrandKit } from '@/lib/types';

const GUEST_MODE_KEY = 'nexus:guest-mode';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  user: { username: string } | null;
  onboardingComplete: boolean;
  brandKit: BrandKit | null;
}

interface AuthContextType extends AuthState {
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  enterGuestMode: () => void;
  refreshBrandKit: () => Promise<void>;
  setOnboardingComplete: (complete: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function readGuestMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(GUEST_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeGuestMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    if (enabled) {
      window.localStorage.setItem(GUEST_MODE_KEY, 'true');
    } else {
      window.localStorage.removeItem(GUEST_MODE_KEY);
    }
  } catch {
    // Ignore local storage failures
  }
}

function hasGuestModeRequest(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('guest') === '1';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedUser = getCachedAuthUser();
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    isGuest: false,
    user: cachedUser,
    onboardingComplete: false,
    brandKit: null,
  });

  // Initialize auth state and restore session from cache/Puter
  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const guestModeRequested = hasGuestModeRequest();
      const persistedGuestMode = readGuestMode();
      const guestMode = guestModeRequested || persistedGuestMode;

      if (guestModeRequested) {
        writeGuestMode(true);
      }

      if (guestMode) {
        if (!mounted) return;

        setState({
          isLoading: false,
          isAuthenticated: false,
          isGuest: true,
          user: null,
          onboardingComplete: false,
          brandKit: null,
        });

        void Promise.all([
          isOnboardingComplete().catch(() => false),
          loadBrandKit().catch(() => null),
        ]).then(([onboarding, brandKit]) => {
          if (!mounted) return;
          setState((current) => ({
            ...current,
            onboardingComplete: onboarding,
            brandKit,
          }));
        });
        return;
      }

      try {
        const authenticated = await isSignedIn().catch(() => false);
        const user = authenticated ? await getUser().catch(() => null) : null;

        if (!mounted) return;

        if (!authenticated) {
          clearCachedAuth();

          setState({
            isLoading: false,
            isAuthenticated: false,
            isGuest: false,
            user: null,
            onboardingComplete: false,
            brandKit: null,
          });
          return;
        }

        writeGuestMode(false);
        await initMemory().catch(() => {});
        const [onboarding, brandKit] = await Promise.all([
          isOnboardingComplete().catch(() => false),
          loadBrandKit().catch(() => null),
        ]);

        if (!mounted) return;

        setState({
          isLoading: false,
          isAuthenticated: true,
          isGuest: false,
          user,
          onboardingComplete: onboarding,
          brandKit,
        });
      } catch {
        if (!mounted) return;
        clearCachedAuth();

        setState({
          isLoading: false,
          isAuthenticated: false,
          isGuest: false,
          user: null,
          onboardingComplete: false,
          brandKit: null,
        });
      }
    }

    checkAuth();
    
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (): Promise<boolean> => {
    try {
      const user = await signIn();

      if (user) {
        writeGuestMode(false);
        await initMemory().catch((error) => {
          console.error('Init memory after login failed:', error);
        });

        const onboarding = await isOnboardingComplete().catch(() => false);
        const brandKit = await loadBrandKit().catch(() => null);

        setState({
          isLoading: false,
          isAuthenticated: true,
          isGuest: false,
          user,
          onboardingComplete: onboarding,
          brandKit,
        });
        
        return true;
      }

      throw new Error('Puter sign-in did not return a user session.');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }, []);

  const enterGuestMode = useCallback(() => {
    writeGuestMode(true);
    setState((current) => ({
      ...current,
      isLoading: false,
      isAuthenticated: false,
      isGuest: true,
      user: null,
    }));
  }, []);

  const logout = useCallback(async () => {
    try {
      writeGuestMode(false);
      await signOut();
      setState({
        isLoading: false,
        isAuthenticated: false,
        isGuest: false,
        user: null,
        onboardingComplete: false,
        brandKit: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  const refreshBrandKit = useCallback(async () => {
    try {
      const brandKit = await loadBrandKit();
      setState(s => ({ ...s, brandKit }));
    } catch (error) {
      console.error('Refresh brand kit error:', error);
    }
  }, []);

  const setOnboardingCompleteState = useCallback((complete: boolean) => {
    setState(s => ({ ...s, onboardingComplete: complete }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        enterGuestMode,
        refreshBrandKit,
        setOnboardingComplete: setOnboardingCompleteState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
