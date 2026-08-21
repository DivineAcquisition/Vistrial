export const ORG_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export type OrgTimezone = (typeof ORG_TIMEZONES)[number];

export const ORG_TIMEZONE_LABELS: Record<OrgTimezone, string> = {
  "America/New_York": "Eastern — America/New_York",
  "America/Chicago": "Central — America/Chicago",
  "America/Denver": "Mountain — America/Denver",
  "America/Los_Angeles": "Pacific — America/Los_Angeles",
  "America/Phoenix": "Arizona — America/Phoenix",
  "America/Anchorage": "Alaska — America/Anchorage",
  "Pacific/Honolulu": "Hawaii — Pacific/Honolulu",
  UTC: "UTC",
};

export function isOrgTimezone(value: string): value is OrgTimezone {
  return (ORG_TIMEZONES as readonly string[]).includes(value);
}

/** Accept any IANA zone Intl can format. GHL contacts are not limited to the org picker. */
export function parseIanaTimeZone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return null;
  }
}
