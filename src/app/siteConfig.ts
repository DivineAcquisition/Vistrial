export const siteConfig = {
  name: "VisTrial",
  url: "https://vistrial.com",
  description: "Professional booking and business management platform.",
  baseLinks: {
    home: "/",
    overview: "/overview",
    details: "/details",
    settings: {
      general: "/settings/general",
      billing: "/settings/billing",
      users: "/settings/users",
      booking: "/settings/booking",
    },
  },
}

export type siteConfig = typeof siteConfig
