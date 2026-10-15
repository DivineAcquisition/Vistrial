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
  leadSources: string[];
  leadSourcesOther: string | null;
  crm: string | null;
  crmOther: string | null;
  dealValue: string | null;
  callsPerWeek: string | null;
  leadsPerMonth: string | null;
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
  const dealValue = one(form, "deal_value");
  const callsPerWeek = one(form, "calls_per_week");
  const leadsPerMonth = one(form, "leads_per_month");
  const crm = one(form, "crm");
  const problem = cleanText(one(form, "problem"), 1200);
  const need = cleanText(one(form, "need"), 1200);
  const sources = form.getAll("lead_sources").map((value) => String(value)).filter((value) => isAllowed(value, "source"));

  if (problem.length > 1000) errors.problem = FORMS.errors.long;
  if (need.length > 1000) errors.need = FORMS.errors.long;

  if (kind === "private_access") {
    if (!isAllowed(businessType, "business")) errors.business_type = FORMS.errors.required;
    if (businessType === "other" && !cleanText(one(form, "business_type_other"), 120)) {
      errors.business_type_other = FORMS.errors.required;
    }
    if (!isAllowed(teamSize, "team")) errors.team_size = FORMS.errors.required;
    if (!isAllowed(dealValue, "deal")) errors.deal_value = FORMS.errors.required;
    if (!isAllowed(callsPerWeek, "calls")) errors.calls_per_week = FORMS.errors.required;
    if (!isAllowed(leadsPerMonth, "leads")) errors.leads_per_month = FORMS.errors.required;
    if (crm && !isAllowed(crm, "crm")) errors.crm = FORMS.errors.required;
    if (crm === "other" && !cleanText(one(form, "crm_other"), 120)) errors.crm_other = FORMS.errors.required;
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
      leadSources: sources.slice(0, 12),
      leadSourcesOther: cleanText(one(form, "lead_sources_other"), 120) || null,
      crm: crm || null,
      crmOther: cleanText(one(form, "crm_other"), 120) || null,
      dealValue: dealValue || null,
      callsPerWeek: callsPerWeek || null,
      leadsPerMonth: leadsPerMonth || null,
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
    leadSources: value.leadSources,
    leadSourcesOther: value.leadSourcesOther,
    crm: value.crm,
    crmOther: value.crmOther,
    dealValue: value.dealValue,
    callsPerWeek: value.callsPerWeek,
    leadsPerMonth: value.leadsPerMonth,
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
