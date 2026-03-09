const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io"

export const siteConfig = {
  name: "Vistrial",
  url: "https://vistrial.io",
  description: "The all-in-one operations platform for service businesses. Automate client follow-ups, manage contacts, run SMS workflows, and grow recurring revenue — from one dashboard.",
  tagline: "Automate Your Service Business",

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
    dashboard: "/dashboard",
    contacts: "/contacts",
    workflows: "/workflows",
    inbox: "/inbox",
    analytics: "/analytics",
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
