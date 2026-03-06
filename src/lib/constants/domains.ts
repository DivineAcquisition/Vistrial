/**
 * Vistrial Domain Configuration
 * 
 * Defines the subdomain structure for the application:
 *   access.vistrial.io → Landing / marketing site only
 *   app.vistrial.io    → Signup, login, dashboard & full application
 */

// Base domain
export const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io"

// Subdomain URLs
export const DOMAINS = {
  // Landing / marketing site (no auth pages)
  access: `https://access.${BASE_DOMAIN}`,
  
  // Application: signup, login, dashboard (authenticated)
  app: `https://app.${BASE_DOMAIN}`,
  
  // Public booking pages
  book: `https://book.${BASE_DOMAIN}`,
  
  // Embeddable widget
  embed: `https://embed.${BASE_DOMAIN}`,
  
  // Customer portal
  portal: `https://portal.${BASE_DOMAIN}`,
  
  // Quote view pages
  quote: `https://q.${BASE_DOMAIN}`,

  // Email sending subdomain (Resend)
  mail: `https://mail.${BASE_DOMAIN}`,
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

/** Login lives on the app domain (app.vistrial.io) */
export function getLoginUrl(): string {
  return `${DOMAINS.app}/login`
}

/** Signup lives on the app domain (app.vistrial.io) */
export function getSignupUrl(): string {
  return `${DOMAINS.app}/signup`
}

/**
 * Returns a URL that is relative in development and absolute in production.
 * Useful for cross-subdomain links (e.g. marketing pages linking to app auth).
 */
export function getRelativeOrAbsoluteUrl(
  subdomain: keyof typeof DOMAINS,
  path: string,
  isDevelopment: boolean = process.env.NODE_ENV === "development"
): string {
  if (isDevelopment) {
    // In development, use relative paths (single localhost origin)
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

/** Convenience: get the signup URL respecting dev/prod environments */
export function getSignupHref(queryString: string = ""): string {
  const qs = queryString ? `?${queryString}` : ""
  return getRelativeOrAbsoluteUrl("app", `/signup${qs}`)
}

/** Convenience: get the login URL respecting dev/prod environments */
export function getLoginHref(): string {
  return getRelativeOrAbsoluteUrl("app", "/login")
}
