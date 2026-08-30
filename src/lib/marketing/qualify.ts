import type { CtaPosition } from "@/lib/marketing/config";
import { TRACKING_PARAM_KEYS, type TrackingParamKey } from "@/lib/marketing/config";

export const MONTHLY_REVENUE_OPTIONS = [
  "Under $8k",
  "$8–20k",
  "$20–50k",
  "$50k+",
] as const;

export const GHL_USE_OPTIONS = ["Yes", "Not yet"] as const;

export const WHO_WORKS_LEADS_OPTIONS = [
  { label: "I do it myself", value: "Founder" },
  { label: "Setters", value: "Setters" },
  { label: "Closers", value: "Closers" },
  { label: "Setters and closers", value: "Setters and closers" },
  { label: "Automations only", value: "Automations only" },
] as const;

export const OFFER_PRICE_OPTIONS = ["Under $2k", "$2–5k", "$5–10k", "$10k+"] as const;

export type MonthlyRevenue = (typeof MONTHLY_REVENUE_OPTIONS)[number];
export type GhlUse = (typeof GHL_USE_OPTIONS)[number];
export type WhoWorksLeads = (typeof WHO_WORKS_LEADS_OPTIONS)[number]["value"];
export type OfferPrice = (typeof OFFER_PRICE_OPTIONS)[number];

export type QualificationInput = {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  monthlyRevenue: string;
  usesGhl: string;
  whoWorksLeads: string;
  offerPrice: string;
  /** Honeypot. Bots that fill it are accepted locally and dropped. */
  website?: string;
  tracking?: Partial<Record<TrackingParamKey, string>>;
};

export type QualificationPayload = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  monthlyRevenue: MonthlyRevenue;
  usesGhl: GhlUse;
  whoWorksLeads: WhoWorksLeads;
  whoWorksLeadsLabel: string;
  offerPrice: OfferPrice;
  source: "Lead Leak Audit";
  entryPoint: "Audit Booking";
  tags: string[];
  ctaPosition: CtaPosition | null;
  tracking: Partial<Record<TrackingParamKey, string>>;
};

export type QualifyErrorField =
  | "fullName"
  | "email"
  | "phone"
  | "companyName"
  | "monthlyRevenue"
  | "usesGhl"
  | "whoWorksLeads"
  | "offerPrice";

export class QualificationError extends Error {
  readonly field?: QualifyErrorField;

  constructor(message: string, field?: QualifyErrorField) {
    super(message);
    this.name = "QualificationError";
    this.field = field;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_RE = /\d/g;
const CTA_POSITIONS: CtaPosition[] = ["nav", "hero", "audit", "waitlist"];

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function whoWorksLeadsFromInput(value: string): WhoWorksLeads | null {
  const match = WHO_WORKS_LEADS_OPTIONS.find(
    (option) => option.value === value || option.label === value
  );
  return match?.value ?? null;
}

export function isHoneypot(input: Pick<QualificationInput, "website">): boolean {
  return Boolean(input.website && input.website.trim());
}

function cleanTracking(
  tracking: QualificationInput["tracking"]
): Partial<Record<TrackingParamKey, string>> {
  const cleaned: Partial<Record<TrackingParamKey, string>> = {};
  if (!tracking) return cleaned;
  for (const key of TRACKING_PARAM_KEYS) {
    const value = tracking[key]?.trim();
    if (value) cleaned[key] = value;
  }
  return cleaned;
}

function ctaPositionFromTracking(
  tracking: Partial<Record<TrackingParamKey, string>>
): CtaPosition | null {
  const from = tracking.from;
  if (from && (CTA_POSITIONS as string[]).includes(from)) return from as CtaPosition;
  return null;
}

export function parseQualification(input: QualificationInput): QualificationPayload {
  const fullName = input.fullName.trim();
  if (fullName.length < 2) {
    throw new QualificationError("Enter your full name.", "fullName");
  }

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new QualificationError("Enter a valid email.", "email");
  }

  const phone = input.phone.trim();
  const digits = phone.match(PHONE_DIGITS_RE)?.length ?? 0;
  if (digits < 7) {
    throw new QualificationError("Enter a valid phone number.", "phone");
  }

  const companyName = input.companyName.trim();
  if (companyName.length < 2) {
    throw new QualificationError("Enter your company name.", "companyName");
  }

  const monthlyRevenue = MONTHLY_REVENUE_OPTIONS.find((option) => option === input.monthlyRevenue);
  if (!monthlyRevenue) {
    throw new QualificationError("Select monthly revenue.", "monthlyRevenue");
  }

  const usesGhl = GHL_USE_OPTIONS.find((option) => option === input.usesGhl);
  if (!usesGhl) {
    throw new QualificationError("Select whether you run LeadConnector.", "usesGhl");
  }

  const whoWorksLeads = whoWorksLeadsFromInput(input.whoWorksLeads);
  if (!whoWorksLeads) {
    throw new QualificationError("Select who works inbound leads.", "whoWorksLeads");
  }

  const offerPrice = OFFER_PRICE_OPTIONS.find((option) => option === input.offerPrice);
  if (!offerPrice) {
    throw new QualificationError("Select your offer price.", "offerPrice");
  }

  const { firstName, lastName } = splitName(fullName);
  const tracking = cleanTracking(input.tracking);
  const whoWorksLeadsLabel =
    WHO_WORKS_LEADS_OPTIONS.find((option) => option.value === whoWorksLeads)?.label ??
    whoWorksLeads;

  return {
    fullName,
    firstName,
    lastName,
    email,
    phone,
    companyName,
    monthlyRevenue,
    usesGhl,
    whoWorksLeads,
    whoWorksLeadsLabel,
    offerPrice,
    source: "Lead Leak Audit",
    entryPoint: "Audit Booking",
    tags: ["lead-leak-audit", "vistrial-qualify"],
    ctaPosition: ctaPositionFromTracking(tracking),
    tracking,
  };
}

export function ghlWebhookBody(payload: QualificationPayload): Record<string, unknown> {
  return {
    fullName: payload.fullName,
    firstName: payload.firstName,
    lastName: payload.lastName,
    first_name: payload.firstName,
    last_name: payload.lastName,
    name: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    companyName: payload.companyName,
    company_name: payload.companyName,
    monthlyRevenue: payload.monthlyRevenue,
    monthly_revenue: payload.monthlyRevenue,
    usesGhl: payload.usesGhl,
    uses_ghl: payload.usesGhl,
    whoWorksLeads: payload.whoWorksLeads,
    who_works_leads: payload.whoWorksLeads,
    whoWorksLeadsLabel: payload.whoWorksLeadsLabel,
    offerPrice: payload.offerPrice,
    offer_price: payload.offerPrice,
    source: payload.source,
    entryPoint: payload.entryPoint,
    entry_point: payload.entryPoint,
    ctaPosition: payload.ctaPosition,
    cta_position: payload.ctaPosition,
    tags: payload.tags,
    ...payload.tracking,
  };
}

export function ghlContactNote(payload: QualificationPayload): string {
  return [
    "Lead Leak Audit qualification",
    `Company: ${payload.companyName}`,
    `Monthly revenue: ${payload.monthlyRevenue}`,
    `LeadConnector: ${payload.usesGhl}`,
    `Who works leads: ${payload.whoWorksLeadsLabel}`,
    `Offer price: ${payload.offerPrice}`,
    payload.ctaPosition ? `CTA: ${payload.ctaPosition}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export type ContactInput = {
  fullName: string;
  email: string;
  message: string;
  website?: string;
};

export type ContactPayload = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  message: string;
  source: "Vistrial contact";
};

export function parseContact(input: ContactInput): ContactPayload {
  const fullName = input.fullName.trim();
  if (fullName.length < 2) {
    throw new QualificationError("Enter your name.", "fullName");
  }
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new QualificationError("Enter a valid email.", "email");
  }
  const message = input.message.trim();
  if (message.length < 4) {
    throw new QualificationError("Enter a message.");
  }
  const { firstName, lastName } = splitName(fullName);
  return {
    fullName,
    firstName,
    lastName,
    email,
    message,
    source: "Vistrial contact",
  };
}

export type WaitlistInput = {
  name: string;
  email: string;
  website?: string;
  tracking?: Partial<Record<TrackingParamKey, string>>;
};

export type WaitlistPayload = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  source: "Vistrial waitlist";
  entryPoint: "Waitlist";
  tags: string[];
  ctaPosition: CtaPosition | null;
  tracking: Partial<Record<TrackingParamKey, string>>;
};

export function parseWaitlist(input: WaitlistInput): WaitlistPayload {
  const fullName = input.name.trim();
  if (fullName.length < 2) {
    throw new QualificationError("Enter your name.", "fullName");
  }
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new QualificationError("Enter a valid email.", "email");
  }
  const { firstName, lastName } = splitName(fullName);
  const tracking = cleanTracking(input.tracking);
  return {
    fullName,
    firstName,
    lastName,
    email,
    source: "Vistrial waitlist",
    entryPoint: "Waitlist",
    tags: ["vistrial-waitlist"],
    ctaPosition: ctaPositionFromTracking(tracking),
    tracking,
  };
}
