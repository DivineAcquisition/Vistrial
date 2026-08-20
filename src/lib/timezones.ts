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
