import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import './globals.css'
import { Providers } from './providers'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import { Toaster } from 'sonner'

const runtimeBootstrap = `
(() => {
  const markFailure = (message) => {
    window.__nexusBootError = message || 'NexusAI failed to start.';
  };

  if (typeof AbortSignal !== 'undefined' && typeof AbortController !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
    AbortSignal.timeout = (ms) => {
      const controller = new AbortController();
      window.setTimeout(() => {
        const reason = typeof DOMException === 'function' ? new DOMException('TimeoutError', 'TimeoutError') : undefined;
        controller.abort(reason);
      }, ms);
      return controller.signal;
    };
  }

  window.addEventListener('error', (event) => markFailure(event.message));
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    markFailure(reason && reason.message ? reason.message : String(reason || 'Unhandled startup rejection'));
  });

  window.setTimeout(() => {
    if (document.documentElement.dataset.nexusAppReady === 'true') return;
    if (document.getElementById('nexus-boot-fallback')) return;

    const fallback = document.createElement('div');
    fallback.id = 'nexus-boot-fallback';
    fallback.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;padding:14px 16px;border:1px solid rgba(239,68,68,.45);border-radius:8px;background:#080b14;color:#f8fafc;font:14px system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.35)';
    fallback.textContent = window.__nexusBootError || 'NexusAI did not finish starting. Reload the page or use a normal http/https app URL.';
    document.body.appendChild(fallback);
  }, 15000);
})();
`;

export const metadata: Metadata = {
  title: 'NexusAI - AI-Powered Social Media Automation',
  description: 'Create, validate, and publish high-quality content across all major social platforms with AI assistance.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NexusAI',
  },
}

export const viewport: Viewport = {
  themeColor: '#080B14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background">
      <head>
        <Script
          id="nexus-runtime-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: runtimeBootstrap }}
        />
        {/* Puter.js CDN */}
        <Script
          src="https://js.puter.com/v2/"
          strategy="beforeInteractive"
        />
      </head>
      <body className="font-sans antialiased">
        <noscript>
          <div style={{ padding: '16px', background: '#080b14', color: '#f8fafc' }}>
            NexusAI requires JavaScript to run.
          </div>
        </noscript>
        <Providers>
          {children}
        </Providers>
        <Toaster />
        <ServiceWorkerRegister />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
