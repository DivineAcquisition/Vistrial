import { vistrialEnv, type VistrialEnv } from "@/lib/ops/env";

/**
 * The CRM does not document a location-id prefix that distinguishes sandbox
 * from production. Staging therefore uses an explicit allowlist. An empty
 * allowlist in staging blocks every location — fail closed.
 */
export function ghlAllowedLocationIds(raw = process.env.GHL_ALLOWED_LOCATION_IDS): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stagingCrmBlocked(args: {
  locationId: string;
  env?: VistrialEnv;
  allowedLocationIds?: string[];
}): { blocked: true; reason: "not_allowlisted" } | { blocked: false } {
  const env = args.env ?? vistrialEnv();
  if (env !== "staging") return { blocked: false };
  const allowed = args.allowedLocationIds ?? ghlAllowedLocationIds();
  if (allowed.includes(args.locationId)) return { blocked: false };
  return { blocked: true, reason: "not_allowlisted" };
}

export function assertStagingCrmAllowed(locationId: string): void {
  const result = stagingCrmBlocked({ locationId });
  if (result.blocked) {
    throw new Error("staging_crm_location_not_allowlisted");
  }
}
