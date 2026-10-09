import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EarlierPassage } from "@/lib/scribe/analyze";
import { GEMINI_EMBED_MODEL, geminiApiKey, geminiEmbed, toVectorLiteral } from "@/lib/scribe/gemini";
import type { Passage } from "@/lib/scribe/passages";
import { ProviderUnavailable } from "@/lib/scribe/provider";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Scribe's tables, written with the service role. Every read and write names
 * the workspace; retrieval never crosses workspaces.
 */

export type Untyped = SupabaseClient;

export function scribeDb(): Untyped {
  return getSupabaseAdmin() as unknown as Untyped;
}

/** Replace a call's passages; returns seq → passage id. */
export async function storePassages(
  db: Untyped,
  args: { orgId: string; callId: string; leadId: string | null; passages: Passage[] }
): Promise<Map<number, string>> {
  await db.from("transcript_passages").delete().eq("org_id", args.orgId).eq("call_id", args.callId);
  const ids = new Map<number, string>();
  for (let i = 0; i < args.passages.length; i += 200) {
    const rows = args.passages.slice(i, i + 200).map((p) => ({
      org_id: args.orgId,
      call_id: args.callId,
      lead_id: args.leadId,
      seq: p.seq,
      speaker: p.speaker,
      speaker_label: p.speakerLabel?.slice(0, 40) ?? null,
      body: p.body.slice(0, 4000),
      char_start: p.charStart,
      char_end: p.charEnd,
    }));
    const { data, error } = await db.from("transcript_passages").insert(rows).select("id, seq");
    if (error) throw new Error("process_failed");
    for (const row of (data ?? []) as Array<{ id: string; seq: number }>) ids.set(row.seq, row.id);
  }
  return ids;
}

/** Embed passages that have no embedding yet. Returns how many were written. */
export async function embedPassages(
  db: Untyped,
  rows: Array<{ id: string; org_id: string; call_id: string; lead_id: string | null; body: string }>
): Promise<number> {
  if (rows.length === 0) return 0;
  const vectors = await geminiEmbed(rows.map((r) => r.body), "RETRIEVAL_DOCUMENT");
  const inserts = rows.map((r, i) => ({
    passage_id: r.id,
    org_id: r.org_id,
    call_id: r.call_id,
    lead_id: r.lead_id,
    model: GEMINI_EMBED_MODEL,
    embedding: toVectorLiteral(vectors[i]),
  }));
  const { error } = await db.from("scribe_embeddings").upsert(inserts, { onConflict: "passage_id", ignoreDuplicates: true });
  if (error) throw new Error("process_failed");
  return inserts.length;
}

/**
 * Passages from recent calls that were stored while embeddings were
 * unavailable. Runs from the transcripts job; quiet when Gemini is down.
 */
export async function backfillScribeEmbeddings(db: Untyped, max = 300): Promise<{ embedded: number; waiting: boolean }> {
  if (!geminiApiKey()) return { embedded: 0, waiting: true };
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let embedded = 0;
  let from = 0;
  while (embedded < max && from < 5000) {
    const { data } = await db
      .from("transcript_passages")
      .select("id, org_id, call_id, lead_id, body")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, from + 499);
    const page = (data ?? []) as Array<{ id: string; org_id: string; call_id: string; lead_id: string | null; body: string }>;
    if (page.length === 0) break;
    const { data: have } = await db.from("scribe_embeddings").select("passage_id").in("passage_id", page.map((p) => p.id));
    const done = new Set(((have ?? []) as Array<{ passage_id: string }>).map((h) => h.passage_id));
    const missing = page.filter((p) => !done.has(p.id)).slice(0, max - embedded);
    try {
      embedded += await embedPassages(db, missing);
    } catch (cause) {
      if (cause instanceof ProviderUnavailable) return { embedded, waiting: true };
      throw cause;
    }
    from += 500;
  }
  return { embedded, waiting: false };
}

/**
 * Passages from this lead's earlier calls that bear on the question. Uses
 * semantic search when embeddings are available, otherwise the most recent
 * passages the lead spoke. Always one workspace, one lead.
 */
export async function retrieveEarlier(
  db: Untyped,
  args: { orgId: string; leadId: string; callId: string; query: string; limit?: number }
): Promise<{ passages: EarlierPassage[]; method: "semantic" | "recent" | "none" }> {
  const limit = args.limit ?? 8;
  if (geminiApiKey() && args.query.trim()) {
    try {
      const [vector] = await geminiEmbed([args.query.slice(0, 2000)], "RETRIEVAL_QUERY");
      const { data, error } = await db.rpc("scribe_search", {
        p_org_id: args.orgId,
        p_embedding: toVectorLiteral(vector),
        p_lead_id: args.leadId,
        p_exclude_call_id: args.callId,
        p_limit: limit,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return {
          passages: (data as Array<{ body: string; speaker: string }>).map((r) => ({ body: r.body, speaker: r.speaker, when: null })),
          method: "semantic",
        };
      }
    } catch {
      // Fall through to recent passages.
    }
  }
  const { data } = await db
    .from("transcript_passages")
    .select("body, speaker, created_at")
    .eq("org_id", args.orgId)
    .eq("lead_id", args.leadId)
    .neq("call_id", args.callId)
    .neq("speaker", "team")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as Array<{ body: string; speaker: string; created_at: string }>;
  return {
    passages: rows.map((r) => ({ body: r.body, speaker: r.speaker, when: r.created_at })),
    method: rows.length ? "recent" : "none",
  };
}
