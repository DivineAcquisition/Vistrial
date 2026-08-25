export const ORG_COOKIE_NAME = "vistrial_org";
export const PENDING_INVITE_COOKIE = "vistrial_pending_invite";
export const ONBOARDING_DEFER_COOKIE = "vistrial_onboarding_later";
export const INVITE_TTL_DAYS = 7;

export const orgCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
};

export const pendingInviteCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60,
};

export const onboardingDeferCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
