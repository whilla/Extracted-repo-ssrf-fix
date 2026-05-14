

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function setupPWAInstallPrompt(callback: (canInstall: boolean) => void) {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    callback(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    callback(false);
  });
}

export async function triggerPWAInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;

  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  } catch (error) {
    console.error('PWA install error:', error);
    return false;
  }
}

export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if app is installed
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function canInstallPWA(): boolean {
  return deferredPrompt !== null;
}
