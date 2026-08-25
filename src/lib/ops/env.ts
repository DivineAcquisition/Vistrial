export type VistrialEnv = "development" | "staging" | "production";

export function vistrialEnv(raw = process.env.VISTRIAL_ENV ?? process.env.APP_ENV): VistrialEnv {
  const value = raw?.trim().toLowerCase();
  if (value === "staging" || value === "production" || value === "development") return value;
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

export function productionSupabaseUrlDenyList(): string[] {
  return (process.env.PRODUCTION_SUPABASE_URLS ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * Staging must not share a database with production. Verified at boot of
 * server routes that write, not assumed from Vercel project names.
 */
export function assertStagingCannotReachProductionDb(args?: {
  env?: VistrialEnv;
  supabaseUrl?: string;
  productionUrls?: string[];
  requireDenylist?: boolean;
}): void {
  const env = args?.env ?? vistrialEnv();
  if (env !== "staging") return;
  const url = (args?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const denylist = args?.productionUrls ?? productionSupabaseUrlDenyList();
  if (denylist.length === 0 && (args?.requireDenylist ?? process.env.NODE_ENV === "production")) {
    throw new Error("staging_missing_production_db_denylist");
  }
  if (url && denylist.includes(url)) {
    throw new Error("staging_points_at_production_database");
  }
}

export function opsAlertWebhookUrl(): string {
  return (
    process.env.OPS_ALERT_WEBHOOK_URL?.trim() ||
    process.env.INGESTION_ALERT_WEBHOOK_URL?.trim() ||
    ""
  );
}
