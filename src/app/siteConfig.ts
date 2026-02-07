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
  
  // Dashboard links (app.vistrial.io)
  baseLinks: {
    home: "/",
    dashboard: "/overview",
    bookings: "/bookings",
    conversions: "/conversions",
    contacts: "/contacts",
    settings: "/settings",
  },
  
  // Marketing links (access.vistrial.io)
  marketingLinks: {
    home: "/",
    login: "/login",
    signup: "/signup",
    pricing: "/pricing",
    features: "/features",
    demo: "/demo",
    privacy: "/privacy",
    terms: "/terms",
  },
}

export type siteConfig = typeof siteConfig
