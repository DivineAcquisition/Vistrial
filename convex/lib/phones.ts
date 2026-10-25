import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Server-only E.164 parse. Unreadable numbers return null. They are never guessed. */
export function toE164(input: string, defaultCountry: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const country = (defaultCountry || "US").toUpperCase() as CountryCode;
  try {
    const parsed = parsePhoneNumberFromString(trimmed, country);
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number;
  } catch {
    return null;
  }
}

export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value.includes("@")) return null;
  const [local, domain] = value.split("@");
  if (!local || !domain || domain.includes(" ")) return null;
  return value;
}

export function normalizeFullName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}
