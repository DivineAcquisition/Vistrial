/**
 * Display copy for the public pricing section.
 *
 * These values are not connected to billing. Prompt 14 can replace this
 * object with the real plan definitions without changing the page layout.
 * There is no checkout on the public site.
 */

export const PRICING_DISPLAY = {
  connectedToBilling: false as const,
  note: "Display copy only. Not connected to billing. Do not treat these strings as the live plan catalog.",
  privateAccess: {
    id: "private_access",
    name: "Private Access",
    price: "Starting at $179 per month.",
    includes: [
      "Your own private workspace",
      "Growth Architect, starting with Market Intelligence",
      "New Growth Architect skills as they ship",
      "Research limits and team seats, shared when your team is approved.",
    ],
    why: "We bring on a limited number of teams at a time so each one is set up properly. Request access and a person on our team will review it.",
    billingNote: "Nothing is charged on this site. Billing details are shared when your team is approved.",
    cta: "Request private access",
    href: "/request",
  },
  custom: {
    id: "custom",
    name: "Custom",
    price: "Let us talk.",
    body: "For agencies, larger teams, and operators running growth for several businesses. Custom can include more seats and workspaces, higher research limits, more connected sources, hands-on setup by our team, a named contact, a security review, and longer history and retention.",
    cta: "Contact us",
    href: "/contact",
  },
} as const;
