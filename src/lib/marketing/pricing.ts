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
    price: "Starting at $97 per month.",
    includes: [
      "Your own private workspace",
      "Sentry, Scribe, Relay, and Compass",
      "Setup for your industry",
      "Team member and monthly lead limits, shared when your team is approved.",
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
    body: "For a larger team or a setup that needs more than Private Access, such as more people or more leads. Custom is for larger sales teams, agencies and operators running follow-up for several businesses, and high-ticket sellers who need more room. It can include more team members and leads, more connected sources, API and webhook access, CRM updates from Vistrial when you turn them on, and higher transcript and Compass usage. It can also include hands-on setup by our team, a named contact, a security review, and longer history and retention.",
    cta: "Contact us",
    href: "/contact",
  },
} as const;
