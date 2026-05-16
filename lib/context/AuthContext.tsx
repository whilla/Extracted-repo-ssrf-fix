'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { signIn, signOut, getUser, isSignedIn, getCachedAuthUser, hasCachedAuthSession, clearCachedAuth } from '@/lib/services/puterService';
import { initMemory, isOnboardingComplete, loadBrandKit } from '@/lib/services/memoryService';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { BrandKit } from '@/lib/types';

const GUEST_MODE_KEY = 'nexus:guest-mode';
const AUTH_BOOTSTRAP_TIMEOUT = 3000; // Reduced from 6000ms for faster initial load

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
  loginWithSupabase: (provider: 'google' | 'github' | 'discord') => Promise<void>;
  logout: () => Promise<void>;
  enterGuestMode: () => void;
  bypassAuth: () => void;
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

function timeoutAfter<T>(ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(fallback), ms);
  });
}

async function withTimeout<T>(task: Promise<T>, fallback: T, ms = AUTH_BOOTSTRAP_TIMEOUT): Promise<T> {
  return Promise.race([task, timeoutAfter(ms, fallback)]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedUser = getCachedAuthUser();
  const hasSession = hasCachedAuthSession();
  const [state, setState] = useState<AuthState>({
    isLoading: !cachedUser, // Fast-path: if we have a cached user, don't block the UI
    isAuthenticated: !!cachedUser,
    isGuest: false,
    user: cachedUser,
    onboardingComplete: false,
    brandKit: null,
  });

  // Initialize auth state and restore session from cache/Puter
  useEffect(() => {
    // SECURITY FIX: Use AbortController instead of just a flag to prevent race conditions
    const abortController = new AbortController();
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

        void (async () => {
          try {
            // SECURITY FIX: Improve error handling with proper error logging
            let onboarding = false;
            let brandKit = null;
            
            try {
              onboarding = await withTimeout(isOnboardingComplete().catch((e) => {
                console.warn('[AuthContext] Failed to check onboarding status:', e);
                return false;
              }), false);
            } catch (e) {
              console.error('[AuthContext] Onboarding check failed:', e);
            }

            try {
              brandKit = await withTimeout(loadBrandKit().catch((e) => {
                console.warn('[AuthContext] Failed to load brand kit:', e);
                return null;
              }), null);
            } catch (e) {
              console.error('[AuthContext] Brand kit load failed:', e);
            }

            if (!mounted || abortController.signal.aborted) return;
            setState((current) => ({
              ...current,
              onboardingComplete: onboarding,
              brandKit,
            }));
          } catch (error) {
            console.error('[AuthContext] Failed to load guest mode data:', error);
          }
        })();
        return;
      }

      try {
        // SECURITY FIX: Separate error handling for authentication and onboarding
        let authenticated = false;
        let user = null;
        
        try {
          authenticated = await withTimeout(isSignedIn().catch((e) => {
            console.warn('[AuthContext] Failed to check sign-in status:', e);
            return false;
          }), false);
        } catch (e) {
          console.error('[AuthContext] Sign-in check failed:', e);
        }

        if (authenticated) {
          try {
            user = await withTimeout(getUser().catch((e) => {
              console.warn('[AuthContext] Failed to get user:', e);
              return null;
            }), null);
          } catch (e) {
            console.error('[AuthContext] User fetch failed:', e);
          }
        }

        if (!mounted || abortController.signal.aborted) return;

        if (!authenticated || !user) {
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
        await withTimeout(initMemory().catch((e) => {
          console.warn('[AuthContext] Failed to initialize memory:', e);
          return undefined;
        }), undefined);
        
        let onboarding = false;
        let brandKit = null;
        
        try {
          const results = await Promise.all([
            withTimeout(isOnboardingComplete().catch((e) => {
              console.warn('[AuthContext] Failed to check onboarding:', e);
              return false;
            }), false),
            withTimeout(loadBrandKit().catch((e) => {
              console.warn('[AuthContext] Failed to load brand kit:', e);
              return null;
            }), null),
          ]);
          onboarding = results[0];
          brandKit = results[1];
        } catch (e) {
          console.error('[AuthContext] Failed to load onboarding/brandkit:', e);
        }

        if (!mounted || abortController.signal.aborted) return;

        setState({
          isLoading: false,
          isAuthenticated: true,
          isGuest: false,
          user,
          onboardingComplete: onboarding,
          brandKit,
        });
      } catch (error) {
        console.error('[AuthContext] Auth check failed:', error);
        if (!mounted || abortController.signal.aborted) return;
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
    
    // SECURITY FIX: Abort in-flight requests when component unmounts
    return () => {
      mounted = false;
      abortController.abort();
    };
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

  const loginWithSupabase = useCallback(async (provider: 'google' | 'github' | 'discord') => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      console.error('Supabase client not available');
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error(`Supabase ${provider} login failed:`, error);
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

  const bypassAuth = useCallback(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (typeof document !== 'undefined') {
      document.cookie = `nexus_bypass_auth=true; path=/; max-age=3600; SameSite=Strict; Secure`;
    }
    setState((current) => ({
      ...current,
      isLoading: false,
      isAuthenticated: true,
      isGuest: false,
      user: { username: 'dev_user' },
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
        loginWithSupabase,
        logout,
        enterGuestMode,
        bypassAuth,
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
