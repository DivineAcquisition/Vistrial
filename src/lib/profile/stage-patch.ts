import type { Json } from "@/types/database";
import type { ProfileStage } from "@/lib/profile/stages";
import {
  DISQUALIFIERS,
  LEAD_CHANNELS,
  OBJECTION_TYPES,
  QUALIFICATION_SIGNALS,
  SETTER_FACTS,
} from "@/lib/profile/vocabulary";

export type StagePatch = Record<string, Json>;

/** A rejected patch carries the sentence the client sees, not an error code. */
export type PatchResult = { ok: true; patch: StagePatch } | { ok: false; error: string };

function text(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? "").trim();
  return value ? value : null;
}

function integer(form: FormData, name: string): number | null {
  const raw = text(form, name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function decimal(form: FormData, name: string): number | null {
  const raw = text(form, name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Money is entered in whole currency units and stored in cents. */
function cents(form: FormData, name: string): number | null {
  const value = decimal(form, name);
  return value === null ? null : Math.round(value * 100);
}

function choices(form: FormData, name: string, allowed: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of form.getAll(name)) {
    const value = String(raw);
    if (allowed.includes(value)) seen.add(value);
  }
  return [...seen];
}

function lines(form: FormData, name: string): string[] {
  return String(form.get(name) ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rows(form: FormData, name: string): Array<Record<string, unknown>> {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * Turn one submitted stage into the patch save_business_profile applies.
 *
 * A half-filled repeatable row is rejected rather than dropped. Silently
 * discarding an answer somebody typed is the worst outcome available here:
 * they see a payoff, believe the answer landed, and it never did.
 */
export function buildStagePatch(stage: ProfileStage, form: FormData): PatchResult {
  switch (stage) {
    case "connect":
      return { ok: true, patch: {} };

    case "business": {
      const price = cents(form, "price_point");
      if (price !== null && price <= 0) {
        return { ok: false, error: "A price point has to be more than nothing." };
      }
      const closeRate = decimal(form, "stated_close_rate_pct");
      if (closeRate !== null && (closeRate < 0 || closeRate > 100)) {
        return { ok: false, error: "A close rate is a percentage between 0 and 100." };
      }
      const cycle = integer(form, "sales_cycle_days");
      if (cycle !== null && (cycle < 1 || cycle > 365)) {
        return { ok: false, error: "A sales cycle has to be between 1 and 365 days." };
      }
      return {
        ok: true,
        patch: {
          offer_name: text(form, "offer_name"),
          offer_type: text(form, "offer_type"),
          offer_type_other: text(form, "offer_type_other"),
          price_point_cents: price,
          payment_structure: text(form, "payment_structure"),
          payment_structure_other: text(form, "payment_structure_other"),
          sales_cycle_days: cycle,
          touches_to_close: integer(form, "touches_to_close"),
          close_motion: text(form, "close_motion"),
          team_structure: text(form, "team_structure"),
          monthly_lead_volume: integer(form, "monthly_lead_volume"),
          monthly_lead_target: integer(form, "monthly_lead_target"),
          stated_close_rate_pct: closeRate,
        },
      };
    }

    case "funnel": {
      const channels = choices(form, "lead_channels", LEAD_CHANNELS.map((item) => item.value));
      const spend: Record<string, number> = {};
      for (const channel of channels) {
        const value = cents(form, `spend_${channel}`);
        if (value !== null && value > 0) spend[channel] = value;
      }
      const fieldRows = rows(form, "application_fields").map((row) => ({
        answer_key: String(row.answer_key ?? "").trim(),
        factor: String(row.factor ?? "").trim() || null,
      }));
      if (fieldRows.some((row) => !row.answer_key && row.factor)) {
        return {
          ok: false,
          error: "One application question has a factor but no answer key. Fill it in or remove the row.",
        };
      }
      return {
        ok: true,
        patch: {
          lead_channels: channels,
          lead_channels_other: text(form, "lead_channels_other"),
          channel_spend_cents: spend,
          application_fields: fieldRows.filter((row) => row.answer_key.length > 0),
        },
      };
    }

    case "qualification": {
      const band = (name: string, label: string) => {
        const parsed = rows(form, name).map((row) => ({
          answer: String(row.answer ?? "").trim(),
          scoreRaw: String(row.score ?? "").trim(),
        }));
        if (parsed.some((row) => !row.answer && row.scoreRaw)) {
          return `One ${label} band has a score but no answer. Fill it in or remove the row.`;
        }
        return parsed
          .filter((row) => row.answer.length > 0)
          .map((row) => ({
            answer: row.answer,
            score: Math.max(0, Math.min(100, Math.round(Number(row.scoreRaw || 0)))),
          }));
      };
      const priceBands = band("price_bands", "investment");
      if (typeof priceBands === "string") return { ok: false, error: priceBands };
      const timelineBands = band("timeline_bands", "timeline");
      if (typeof timelineBands === "string") return { ok: false, error: timelineBands };

      return {
        ok: true,
        patch: {
          qualification_signals: choices(
            form,
            "qualification_signals",
            QUALIFICATION_SIGNALS.map((item) => item.value)
          ),
          qualification_signals_other: text(form, "qualification_signals_other"),
          disqualifiers: choices(form, "disqualifiers", DISQUALIFIERS.map((item) => item.value)),
          disqualifiers_other: text(form, "disqualifiers_other"),
          price_bands: priceBands,
          timeline_bands: timelineBands,
        },
      };
    }

    case "process": {
      const minutes = integer(form, "speed_to_lead_intent_minutes");
      if (minutes !== null && (minutes < 1 || minutes > 1440)) {
        return { ok: false, error: "The response window has to be between 1 minute and 24 hours." };
      }
      const stageRows = rows(form, "pipeline_stage_meanings").map((row) => ({
        crm_stage: String(row.crm_stage ?? "").trim(),
        means: String(row.means ?? "").trim() || null,
      }));
      if (stageRows.some((row) => !row.crm_stage && row.means)) {
        return {
          ok: false,
          error: "One pipeline stage has a meaning but no stage name. Fill it in or remove the row.",
        };
      }
      return {
        ok: true,
        patch: {
          speed_to_lead_intent_minutes: minutes,
          setter_establishes: choices(
            form,
            "setter_establishes",
            SETTER_FACTS.map((item) => item.value)
          ),
          setter_establishes_other: text(form, "setter_establishes_other"),
          pipeline_stage_meanings: stageRows.filter((row) => row.crm_stage.length > 0),
          after_no_show: text(form, "after_no_show"),
          after_call: text(form, "after_call"),
          after_silence: text(form, "after_silence"),
        },
      };
    }

    case "objections": {
      const allowed: string[] = OBJECTION_TYPES.map((item) => item.value);
      const objectionRows = rows(form, "top_objections").map((row) => ({
        type: String(row.type ?? "").trim(),
        phrasing: String(row.phrasing ?? "").trim(),
        response: String(row.response ?? "").trim() || null,
      }));
      const orphan = objectionRows.find((row) => row.phrasing && !allowed.includes(row.type));
      if (orphan) {
        return {
          ok: false,
          error: `"${orphan.phrasing}" has no objection type against it. Pick one or remove the row.`,
        };
      }
      const objections = objectionRows.filter(
        (row) => allowed.includes(row.type) && row.phrasing.length > 0
      );
      const seen = new Set<string>();
      for (const row of objections) {
        if (seen.has(row.type)) {
          return {
            ok: false,
            error: "Two objections share the same type. Only the first of each type is kept, so merge them.",
          };
        }
        seen.add(row.type);
      }
      return { ok: true, patch: { top_objections: objections } };
    }

    case "voice":
      return {
        ok: true,
        patch: {
          voice_formality: text(form, "voice_formality"),
          channel_preference: text(form, "channel_preference"),
          never_say: lines(form, "never_say"),
        },
      };

    case "goals": {
      const value = decimal(form, "goal_value");
      if (value !== null && value <= 0) {
        return { ok: false, error: "A target has to be a number above zero." };
      }
      return {
        ok: true,
        patch: {
          goal_metric: text(form, "goal_metric"),
          goal_value: value,
          aggregate_opt_out: form.get("aggregate_opt_out") === "on",
        },
      };
    }
  }
}
