import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSentryConfig } from '@sentry/nextjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const baseConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'https', hostname: 'puter.com' },
      { protocol: 'https', hostname: '*.puter.com' },
      { protocol: 'https', hostname: '**.supabase.co' }, // For Supabase Storage
    ],
  },
  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' blob: https://js.puter.com https://cdn.puter.com https://puter.com https://*.puter.com",
              "style-src 'self' https: 'unsafe-inline'",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "media-src 'self' data: https:",
               "connect-src 'self' https://*.puter.com https://*.supabase.co https://*.ayrshare.com https://*.googleapis.com https://api.groq.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com wss://*.puter.com wss://*.supabase.co",
              "frame-src 'self' https://puter.com https://*.puter.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://puter.com https://*.puter.com",
              "upgrade-insecure-requests",
            ].join('; ')
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  },
}

export default withSentryConfig(baseConfig, {
  org: process.env.SENTRY_ORG || '',
  project: process.env.SENTRY_PROJECT || 'nexusai',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: process.env.NODE_ENV === 'production',
  tunnelRoute: '/monitoring/sentry',
});
