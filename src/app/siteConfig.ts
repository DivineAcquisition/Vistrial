const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io"

export const siteConfig = {
  name: "Vistrial",
  url: "https://vistrial.io",
  description: "Convert one-time cleaning clients into recurring revenue with automated SMS sequences. The conversion engine built for residential cleaning companies.",
  tagline: "One-Time to Recurring Conversion Engine",
  
  domains: {
    base: BASE_DOMAIN,
    access: `https://access.${BASE_DOMAIN}`,
    app: `https://app.${BASE_DOMAIN}`,
    book: `https://book.${BASE_DOMAIN}`,
    embed: `https://embed.${BASE_DOMAIN}`,
    portal: `https://portal.${BASE_DOMAIN}`,
    quote: `https://q.${BASE_DOMAIN}`,
  },
  
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
