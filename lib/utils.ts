import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// SECURITY: URL validation to prevent open redirect attacks
const SAFE_INTERNAL_ROUTES = new Set([
  '/dashboard',
  '/onboarding',
  '/settings',
  '/profile',
  '/help',
  '/about',
  '/privacy',
  '/terms',
  '/logout',
])

export function isValidInternalRoute(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') {
    return false
  }

  // Prevent protocol-based redirects
  if (url.includes('://') || url.includes('\\\\')) {
    return false
  }

  // Prevent protocol-relative redirects
  if (url.match(/^\s*\/\s*\//)) {
    return false
  }

  try {
    const urlObj = new URL(url, 'http://internal')
    const pathname = urlObj.pathname

    // Allow known safe routes
    if (SAFE_INTERNAL_ROUTES.has(pathname)) {
      return true
    }

    // Allow dynamic routes within safe sections
    if (pathname.startsWith('/dashboard/') || pathname.startsWith('/settings/')) {
      return true
    }

    return false
  } catch {
    return false
  }
}

export function sanitizeRedirectUrl(
  url: string | null | undefined,
  defaultUrl = '/dashboard'
): string {
  return typeof url === 'string' && isValidInternalRoute(url) ? url : defaultUrl
}
