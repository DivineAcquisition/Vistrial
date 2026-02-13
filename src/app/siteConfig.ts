// Base domain configuration
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io"

export const siteConfig = {
  name: "Vistrial",
  url: "https://vistrial.com",
  description: "Quote Follow-Up Automation for Home Service Pros",
  
  // Domain configuration
  domains: {
    base: BASE_DOMAIN,
    access: `https://access.${BASE_DOMAIN}`,
    app: `https://app.${BASE_DOMAIN}`,
    book: `https://book.${BASE_DOMAIN}`,
    embed: `https://embed.${BASE_DOMAIN}`,
    portal: `https://portal.${BASE_DOMAIN}`,
    quote: `https://q.${BASE_DOMAIN}`,
  },
  
  // App links — served on app.vistrial.io (auth + dashboard)
  baseLinks: {
    home: "/",
    dashboard: "/overview",
    bookings: "/bookings",
    conversions: "/conversions",
    contacts: "/contacts",
    settings: "/settings",
    login: "/login",
    signup: "/signup",
  },
  
  // Marketing / landing page links — served on access.vistrial.io
  marketingLinks: {
    home: "/",
    pricing: "/pricing",
    features: "/features",
    demo: "/demo",
    privacy: "/privacy",
    terms: "/terms",
  },
}

export type siteConfig = typeof siteConfig
