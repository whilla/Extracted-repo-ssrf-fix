import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import './globals.css'
import { Providers } from './providers'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import { Toaster } from 'sonner'
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary'
import { initSentry } from '@/lib/utils/sentry'
import { validateEnv } from '@/lib/utils/env'
import { AppWrapper } from '@/components/nexus/AppWrapper'
import { ApiLoadingProvider } from '@/context/ApiLoadingContext'
import { GlobalLoader } from '@/components/nexus/GlobalLoader'

if (typeof window !== 'undefined') {
  initSentry();
}

// Validate environment variables on server
const envValidation = validateEnv();
if (!envValidation.valid) {
  console.warn(`[NexusAI] Missing environment variables: ${envValidation.missing.join(', ')}`);
}

const runtimeBootstrap = `
(() => {
  // Polyfill AbortSignal.timeout if needed
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

  // Make Puter.js optional - load it but don't block if it fails
  window.__puterAvailable = false;
  const puterScript = document.createElement('script');
  puterScript.src = 'https://js.puter.com/v2/';
  puterScript.crossOrigin = 'anonymous';
  puterScript.onload = () => {
    console.log('[Puter] Loaded successfully');
    window.__puterAvailable = true;
  };
  puterScript.onerror = () => {
    console.warn('[Puter] Failed to load. Core features will work without Puter.');
    window.__puterAvailable = false;
  };
  document.head.appendChild(puterScript);

  // Mark app as ready immediately - don't wait for external services
  document.documentElement.dataset.nexusAppReady = 'true';
  console.log('[NexusAI] App initialized successfully');
  
  // Remove any existing loading indicators
  const existingLoader = document.getElementById('nexus-app-loader');
  if (existingLoader) {
    existingLoader.style.display = 'none';
  }
})();
`;

export const metadata: Metadata = {
  title: 'NexusAI - AI-Powered Social Media Automation',
  description: 'Create, validate, and publish high-quality content across all major social platforms with AI assistance.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://nexusai.app'),
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NexusAI',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'NexusAI',
    title: 'NexusAI - AI-Powered Social Media Automation',
    description: 'Create, validate, and publish high-quality content across all major social platforms with AI assistance.',
    images: [{ url: '/og-image.svg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NexusAI - AI-Powered Social Media Automation',
    description: 'Create, validate, and publish high-quality content across all major social platforms with AI assistance.',
    images: ['/og-image.svg'],
  },
  robots: {
    index: true,
    follow: true,
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
        {/* Puter.js CDN - non-critical, graceful degradation if unavailable */}
        <Script
          src="https://js.puter.com/v2/"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />

      </head>
      <body className="font-sans antialiased">
        <noscript>
          <div style={{ padding: '16px', background: '#080b14', color: '#f8fafc' }}>
            NexusAI requires JavaScript to run.
          </div>
        </noscript>
        <GlobalErrorBoundary>
          <Providers>
            <ApiLoadingProvider>
              <AppWrapper>
                {children}
              </AppWrapper>
              <GlobalLoader />
            </ApiLoadingProvider>
          </Providers>
        </GlobalErrorBoundary>
        <Toaster />
        <ServiceWorkerRegister />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
