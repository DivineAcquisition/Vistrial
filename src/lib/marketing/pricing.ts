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
      "[CONFIRM: a limited number of team members and leads each month. The exact limits are shared when you are approved.]",
    ],
    why: "[CONFIRM: We onboard a limited number of teams at a time so each one is set up properly. Request access and we will review your request.]",
    billingNote: "[CONFIRM: Billing begins after approval and onboarding is agreed. No setup fee or contract length is stated here.]",
    cta: "Request private access",
    href: "/request",
  },
  custom: {
    id: "custom",
    name: "Custom",
    price: "Let us talk.",
    body: "For a larger team or a setup that needs more than Private Access, such as more people or more leads. [CONFIRM: list only needs you actually offer. Single sign-on is left out until you approve that wording.]",
    cta: "Contact us",
    href: "/contact",
  },
} as const;
