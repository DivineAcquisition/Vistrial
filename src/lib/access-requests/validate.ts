import { CAMPAIGN_KEYS, isAllowed, type CampaignKey } from "@/lib/access-requests/options";
import { FORMS } from "@/lib/marketing/content";

export type RequestKind = "private_access" | "custom";

export type AccessSubmission = {
  kind: RequestKind;
  fullName: string;
  email: string;
  businessName: string;
  website: string | null;
  businessType: string | null;
  businessTypeOther: string | null;
  teamSize: string | null;
  clientCount: string | null;
  channels: string[];
  channelsOther: string | null;
  adSpend: string | null;
  offerPrice: string | null;
  firstWant: string | null;
  figures: string | null;
  problem: string | null;
  heardAbout: string | null;
  phone: string | null;
  need: string | null;
  pagePath: string;
  campaign: Partial<Record<CampaignKey, string>>;
  honeypot: string;
};

export type FieldErrors = Partial<Record<string, string>>;

export type ParseResult =
  | { ok: true; value: AccessSubmission }
  | { ok: false; errors: FieldErrors; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

export function cleanText(value: unknown, max: number): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  return [...text].slice(0, max).join("");
}

function one(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export function parseAccessForm(form: FormData, kind: RequestKind): ParseResult {
  const errors: FieldErrors = {};
  const fullName = cleanText(one(form, "full_name"), 120);
  const email = cleanText(one(form, "email"), 200).toLowerCase();
  const businessName = cleanText(one(form, "business_name"), 160);
  const websiteRaw = cleanText(one(form, "website"), 200);
  const phone = cleanText(one(form, "phone"), 40);
  const consent = one(form, "consent") === "yes";

  if (!fullName) errors.full_name = FORMS.errors.required;
  if (!email || !EMAIL.test(email)) errors.email = FORMS.errors.email;
  if (!businessName) errors.business_name = FORMS.errors.required;
  if (!consent) errors.consent = FORMS.errors.consent;
  if (websiteRaw && !WEBSITE.test(websiteRaw)) errors.website = FORMS.errors.website;
  if (phone.length > 40) errors.phone = FORMS.errors.phone;

  const businessType = one(form, "business_type");
  const teamSize = one(form, "team_size");
  const clientCount = one(form, "client_count");
  const adSpend = one(form, "ad_spend");
  const offerPrice = one(form, "offer_price");
  const firstWant = one(form, "first_want");
  const figures = one(form, "figures");
  const problem = cleanText(one(form, "problem"), 1200);
  const need = cleanText(one(form, "need"), 1200);
  const channels = form.getAll("channels").map((value) => String(value)).filter((value) => isAllowed(value, "channel"));

  if (problem.length > 1000) errors.problem = FORMS.errors.long;
  if (need.length > 1000) errors.need = FORMS.errors.long;

  if (kind === "private_access") {
    if (!isAllowed(businessType, "business")) errors.business_type = FORMS.errors.required;
    if (businessType === "other" && !cleanText(one(form, "business_type_other"), 120)) {
      errors.business_type_other = FORMS.errors.required;
    }
    if (!isAllowed(teamSize, "team")) errors.team_size = FORMS.errors.required;
    if (!isAllowed(clientCount, "clients")) errors.client_count = FORMS.errors.required;
    if (!isAllowed(adSpend, "spend")) errors.ad_spend = FORMS.errors.required;
    if (!isAllowed(offerPrice, "price")) errors.offer_price = FORMS.errors.required;
    if (!isAllowed(firstWant, "want")) errors.first_want = FORMS.errors.required;
    if (figures && !isAllowed(figures, "figures")) errors.figures = FORMS.errors.required;
  } else if (!need) {
    errors.need = FORMS.errors.required;
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors, message: "Check the fields below and try again." };
  }

  const campaign: Partial<Record<CampaignKey, string>> = {};
  let rawCampaign: unknown = null;
  try {
    rawCampaign = JSON.parse(one(form, "campaign") || "{}");
  } catch {
    rawCampaign = null;
  }
  if (rawCampaign && typeof rawCampaign === "object") {
    const record = rawCampaign as Record<string, unknown>;
    for (const key of CAMPAIGN_KEYS) {
      const value = cleanText(record[key], 120);
      if (value) campaign[key] = value;
    }
  }

  const pagePath = cleanText(one(form, "page_path"), 200);
  return {
    ok: true,
    value: {
      kind,
      fullName,
      email,
      businessName,
      website: websiteRaw || null,
      businessType: kind === "private_access" ? businessType : null,
      businessTypeOther: cleanText(one(form, "business_type_other"), 120) || null,
      teamSize: teamSize || null,
      clientCount: clientCount || null,
      channels: channels.slice(0, 12),
      channelsOther: cleanText(one(form, "channels_other"), 120) || null,
      adSpend: adSpend || null,
      offerPrice: offerPrice || null,
      firstWant: firstWant || null,
      figures: figures || null,
      problem: problem ? problem.slice(0, 1000) : null,
      heardAbout: cleanText(one(form, "heard_about"), 160) || null,
      phone: phone || null,
      need: kind === "custom" ? need.slice(0, 1000) : null,
      pagePath: pagePath.startsWith("/") && !pagePath.includes("?") ? pagePath : kind === "custom" ? "/contact" : "/request",
      campaign,
      honeypot: cleanText(one(form, "company_website_confirm"), 200),
    },
  };
}

export function submissionPayload(value: AccessSubmission): Record<string, unknown> {
  return {
    kind: value.kind,
    fullName: value.fullName,
    email: value.email,
    businessName: value.businessName,
    website: value.website,
    businessType: value.businessType,
    businessTypeOther: value.businessTypeOther,
    teamSize: value.teamSize,
    clientCount: value.clientCount,
    channels: value.channels,
    channelsOther: value.channelsOther,
    adSpend: value.adSpend,
    offerPrice: value.offerPrice,
    firstWant: value.firstWant,
    figures: value.figures,
    problem: value.problem,
    heardAbout: value.heardAbout,
    phone: value.phone,
    need: value.need,
    consent: "true",
    pagePath: value.pagePath,
    campaign: value.campaign,
    honeypot: value.honeypot,
  };
}
