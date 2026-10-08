import { getTimezone } from "countries-and-timezones";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

import PHONE_TIMEZONES from "@/lib/compliance/phone-timezones.json";

const PREFIXES = PHONE_TIMEZONES as Record<string, string[]>;
const LONGEST_PREFIX = Math.max(...Object.keys(PREFIXES).map((key) => key.length));

/**
 * A prefix this broad says nothing useful about where the person is: North
 * American numbers whose area code is not in the data would otherwise match
 * every zone from Hawaii to Newfoundland.
 */
const TOO_BROAD = new Set(["1"]);

export type LeadTimeZones = {
  /** Every zone the lead may be in. Quiet hours apply if any of them is quiet. */
  zones: string[];
  basis: "stored" | "phone" | "workspace";
  /** More than one zone was possible, so the stricter result is used. */
  uncertain: boolean;
};

function isZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The country to read a number without a country code against: the business's own. */
function defaultCountryFor(workspaceTimeZone: string): CountryCode | undefined {
  const country = getTimezone(workspaceTimeZone)?.countries[0];
  return (country as CountryCode | undefined) ?? undefined;
}

/** The zones a phone number may be in, from the longest matching prefix. */
export function zonesForPhone(phone: string | null | undefined, workspaceTimeZone: string): string[] {
  if (!phone?.trim()) return [];
  const parsed = parsePhoneNumberFromString(phone, defaultCountryFor(workspaceTimeZone));
  if (!parsed) return [];
  const digits = `${parsed.countryCallingCode}${parsed.nationalNumber}`;
  for (let length = Math.min(LONGEST_PREFIX, digits.length); length > 0; length -= 1) {
    const prefix = digits.slice(0, length);
    const zones = PREFIXES[prefix];
    if (!zones) continue;
    if (TOO_BROAD.has(prefix)) return [];
    return zones.filter(isZone);
  }
  return [];
}

/**
 * Where a lead is, for quiet hours: their stored time zone when the CRM has
 * one, otherwise every zone their phone number may be in, and the business's
 * own zone only when neither says anything.
 */
export function leadTimeZones(
  lead: { timezone?: string | null; phone?: string | null },
  workspaceTimeZone: string
): LeadTimeZones {
  if (isZone(lead.timezone)) return { zones: [lead.timezone], basis: "stored", uncertain: false };
  const fromPhone = zonesForPhone(lead.phone, workspaceTimeZone);
  if (fromPhone.length > 0) return { zones: fromPhone, basis: "phone", uncertain: fromPhone.length > 1 };
  return { zones: [workspaceTimeZone], basis: "workspace", uncertain: false };
}
