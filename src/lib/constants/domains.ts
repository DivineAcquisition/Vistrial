/**
 * Vistrial Domain Configuration
 * 
 * Defines the subdomain structure for the application
 */

// Base domain
export const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io"

// Subdomain URLs
export const DOMAINS = {
  // Landing/marketing site
  access: `https://access.${BASE_DOMAIN}`,
  
  // Business dashboard (authenticated)
  app: `https://app.${BASE_DOMAIN}`,
  
  // Public booking pages
  book: `https://book.${BASE_DOMAIN}`,
  
  // Embeddable widget
  embed: `https://embed.${BASE_DOMAIN}`,
  
  // Customer portal
  portal: `https://portal.${BASE_DOMAIN}`,
  
  // Quote view pages
  quote: `https://q.${BASE_DOMAIN}`,
} as const

// Helper functions
export function getBookingUrl(slug: string): string {
  return `${DOMAINS.book}/${slug}`
}

export function getEmbedUrl(slug: string): string {
  return `${DOMAINS.embed}/${slug}`
}

export function getQuoteUrl(token: string): string {
  return `${DOMAINS.quote}/${token}`
}

export function getPortalUrl(slug: string): string {
  return `${DOMAINS.portal}/${slug}`
}

export function getDashboardUrl(path: string = ""): string {
  return `${DOMAINS.app}${path}`
}

export function getLoginUrl(): string {
  return `${DOMAINS.access}/login`
}

export function getSignupUrl(): string {
  return `${DOMAINS.access}/signup`
}

// For development, use relative URLs
export function getRelativeOrAbsoluteUrl(
  subdomain: keyof typeof DOMAINS,
  path: string,
  isDevelopment: boolean = process.env.NODE_ENV === "development"
): string {
  if (isDevelopment) {
    // In development, use relative paths
    switch (subdomain) {
      case "book":
        return `/book${path}`
      case "embed":
        return `/embed${path}`
      case "quote":
        return `/q${path}`
      case "portal":
        return `/portal${path}`
      case "app":
        return path
      case "access":
        return path
      default:
        return path
    }
  }
  
  return `${DOMAINS[subdomain]}${path}`
}
