import "server-only";

import { anthropicModel } from "@/lib/extraction/anthropic";
import { extractCall } from "@/lib/scribe/extract";
import { findSpokenOptOut } from "@/lib/scribe/optout";
import { passagesForPrompt, splitPassages } from "@/lib/scribe/passages";
import { parseFacts, parseSensitive, quoteGrounding, readCaseFacts } from "@/lib/scribe/prompt";
import { meetsBar, scoreSample, summarize, type QualityMetrics } from "@/lib/scribe/quality/metrics";
import { QUALITY_SAMPLES, type QualityTemplate } from "@/lib/scribe/quality/samples";
import { findSensitive } from "@/lib/scribe/safety";
import { scribeDb } from "@/lib/scribe/store";
import { TRANSCRIPT_HEAD_CHARS, TRANSCRIPT_TAIL_CHARS } from "@/lib/transcripts/constants";

/**
 * Runs the synthetic calls for one template through the same reading path as
 * production (no workspace data involved) and records the metrics.
 */
export async function runScribeQuality(template: QualityTemplate, createdBy: string | null): Promise<{ metrics: QualityMetrics; passed: boolean }> {
  const db = scribeDb();
  const { data: row } = await db.from("config_templates").select("id").eq("slug", template).maybeSingle();
  const { data: layer } = row
    ? await db.from("config_layers").select("field_values").eq("level", "template").eq("template_id", row.id).maybeSingle()
    : { data: null };
  const values = ((layer as { field_values?: Record<string, unknown> } | null)?.field_values ?? {}) as Record<string, unknown>;
  const facts = readCaseFacts(values["industry.case_facts"]);
  const businessDescription = String(values["industry.business_description"] ?? "a business");

  const scores = [];
  const models = new Set<string>();
  for (const sample of QUALITY_SAMPLES[template]) {
    const passages = splitPassages(sample.transcript, { prospectNames: [sample.prospect], teamNames: sample.team });
    const ids = new Map(passages.map((p) => [p.seq, `sample-${p.seq}`]));
    const window = passagesForPrompt(passages, TRANSCRIPT_HEAD_CHARS, TRANSCRIPT_TAIL_CHARS);
    const result = await extractCall({ businessDescription, facts, objectionLabels: [], passagesText: window.text, truncated: window.truncated });
    models.add(`${result.provider}:${result.model}`);
    const extracted = parseFacts(result.json, facts, passages, ids);
    const grounding = quoteGrounding(extracted, sample.transcript);
    scores.push(
      scoreSample(sample, extracted, {
        optOut: findSpokenOptOut(passages) != null,
        sensitive: findSensitive(passages).length > 0 || parseSensitive(result.json) != null,
        ...grounding,
      })
    );
  }
  const metrics = summarize(scores);
  const passed = meetsBar(metrics);
  await db.from("scribe_quality_runs").insert({
    template_slug: template,
    extract_model: [...models].join(", ").slice(0, 200),
    analysis_model: anthropicModel(),
    samples: scores.length,
    metrics: { ...metrics, perSample: scores },
    passed,
    created_by: createdBy,
  });
  return { metrics, passed };
}
