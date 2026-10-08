import type { SupabaseClient } from "@supabase/supabase-js";

import { registryPlatformValues } from "@/lib/config/registry";
import type { Database } from "@/types/database";

/** The few configuration values customer-facing screens show (Forsight, the Stellar portal). */
export type DisplaySettings = {
  forsightHistoryWeeks: number;
  /** Days without human contact: going quiet, silent, long silent. */
  forsightQuietDays: number;
  forsightSilentDays: number;
  forsightLongSilentDays: number;
  stellarStageLabels: Record<string, string>;
};

const PLATFORM = registryPlatformValues();

/** The platform defaults, which are also what these screens showed before configuration existed. */
export const PLATFORM_DISPLAY_SETTINGS: DisplaySettings = {
  forsightHistoryWeeks: Number(PLATFORM["sources.forsight_history_weeks"]),
  forsightQuietDays: Number(PLATFORM["sources.forsight_quiet_days"]),
  forsightSilentDays: Number(PLATFORM["sources.forsight_silent_days"]),
  forsightLongSilentDays: Number(PLATFORM["sources.forsight_long_silent_days"]),
  stellarStageLabels: PLATFORM["sources.stellar_stage_labels"] as Record<string, string>,
};

/**
 * Read with the viewer's own session through config_display_settings, which
 * shares only these values with people who belong to the workspace. If it
 * cannot be read, the screen shows the platform defaults rather than nothing.
 */
export async function loadDisplaySettings(db: Pick<SupabaseClient<Database>, "rpc">, orgId: string): Promise<DisplaySettings> {
  const { data, error } = await db.rpc("config_display_settings", { p_org_id: orgId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return PLATFORM_DISPLAY_SETTINGS;
  const row = data as Record<string, unknown>;
  const number = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);
  return {
    forsightHistoryWeeks: number(row.forsight_history_weeks, PLATFORM_DISPLAY_SETTINGS.forsightHistoryWeeks),
    forsightQuietDays: number(row.forsight_quiet_days, PLATFORM_DISPLAY_SETTINGS.forsightQuietDays),
    forsightSilentDays: number(row.forsight_silent_days, PLATFORM_DISPLAY_SETTINGS.forsightSilentDays),
    forsightLongSilentDays: number(row.forsight_long_silent_days, PLATFORM_DISPLAY_SETTINGS.forsightLongSilentDays),
    stellarStageLabels: {
      ...PLATFORM_DISPLAY_SETTINGS.stellarStageLabels,
      ...((row.stellar_stage_labels as Record<string, string> | null) ?? {}),
    },
  };
}
