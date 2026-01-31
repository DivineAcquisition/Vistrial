export const siteConfig = {
  name: "Vistrial",
  url: "https://vistrial.com",
  description: "Powerful analytics and insights for your business.",
  baseLinks: {
    home: "/",
    overview: "/overview",
    details: "/details",
    settings: {
      general: "/settings/general",
      billing: "/settings/billing",
      users: "/settings/users",
    },
  },
}

export type siteConfig = typeof siteConfig
