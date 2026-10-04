import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import { parseTurns } from "@/lib/coaching/analyze";
import { analyzeSources, objectionLabel, periodLabel } from "@/lib/sales-os/analysis";
import type { AssetToolResult, AssetView } from "@/lib/sales-os/asset-types";
import { ASSET_TYPE_COPY, type AssetType } from "@/lib/sales-os/catalog";
import {
  loadObjectionHandlings,
  loadObjections,
  loadProspectQuotes,
  loadTranscriptCalls,
  windowDays,
  type SalesDb,
  type TranscriptCall,
  type Window,
} from "@/lib/sales-os/data";
import { loadDataset, type Reader } from "@/lib/sales-os/dataset";
import { salesOsModel } from "@/lib/sales-os/model";
import { MIN_SAMPLE_PATTERN, MIN_SAMPLE_PER_GROUP, insufficient, rate, sampleLabel } from "@/lib/sales-os/stats";
import type { Database, Json } from "@/types/database";

type AssetRow = Database["public"]["Tables"]["sales_os_assets"]["Row"];

export type AssetActor = Reader & {
  memberId: string;
  personName: string;
  canWriteAssets: boolean;
  conversationId: string | null;
};

const DAY = 86_400_000;
const MIN_AD_QUOTES = 10;
const MAX_SCRIPT_CALLS = 10;
const MAX_TURNS_PER_CALL = 40;
const MAX_TURN_CHARS = 260;

function fmtDate(iso: string | null): string {
  if (!iso) return "date unknown";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function toAssetView(row: AssetRow, names: Map<string, string>): AssetView {
  return {
    id: row.id,
    familyId: row.family_id,
    version: row.version,
    type: row.asset_type as AssetType,
    typeLabel: ASSET_TYPE_COPY[row.asset_type as AssetType]?.title ?? row.asset_type,
    title: row.title,
    body: row.body,
    basis: row.basis,
    sampleSize: row.sample_size,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status === "superseded" ? "superseded" : "current",
    origin: row.origin === "edit" ? "edit" : "agent",
    createdAt: row.created_at,
    createdByName: names.get(row.created_by_member_id) ?? null,
    reviewedAt: row.reviewed_at,
    reviewedByName: row.reviewed_by_member_id ? names.get(row.reviewed_by_member_id) ?? null : null,
    dataAgeDays: Math.max(0, Math.floor((Date.now() - new Date(row.period_end).getTime()) / DAY)),
  };
}

export async function memberNames(db: SalesDb, orgId: string): Promise<Map<string, string>> {
  const { data } = await db.from("org_members").select("id, display_name").eq("org_id", orgId);
  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}

async function saveVersion(
  actor: AssetActor,
  args: {
    familyId: string | null;
    type: AssetType;
    title: string;
    body: string;
    basis: string;
    sampleSize: number;
    window: Window;
    evidence: unknown;
    origin: "agent" | "edit";
  }
): Promise<AssetView> {
  const { data, error } = await actor.db.rpc("sales_os_save_asset_version", {
    p_org_id: actor.orgId,
    p_family_id: args.familyId,
    p_asset_type: args.type,
    p_title: args.title.trim().slice(0, 160),
    p_body: args.body.trim(),
    p_basis: args.basis,
    p_sample_size: args.sampleSize,
    p_period_start: args.window.from,
    p_period_end: args.window.to,
    p_evidence: args.evidence as Json,
    p_origin: args.origin,
    p_conversation_id: actor.conversationId,
  });
  if (error || !data) {
    if (error?.code === "42501") throw new Error("Only an owner or admin can save assets in this workspace.");
    throw new Error("Vistrial couldn't save the asset.");
  }
  const row = (Array.isArray(data) ? data[0] : data) as AssetRow;
  return toAssetView(row, await memberNames(actor.db, actor.orgId));
}

function denied(): AssetToolResult {
  return {
    kind: "asset",
    status: "permission",
    message: "Only an owner or admin can create scripts and assets in this workspace. You can still ask about the data.",
  };
}

function notEnough(have: number, need: number, what: string): AssetToolResult {
  const gap = insufficient(have, need, what);
  return {
    kind: "asset",
    status: "insufficient_data",
    message: `${gap.message} Vistrial won't write a generic one in its place.`,
    have,
    need,
    what,
  };
}

async function closedLeadIds(db: SalesDb, orgId: string, window: Window): Promise<string[]> {
  const [{ data: changes }, { data: netClose }] = await Promise.all([
    db
      .from("lead_status_changes")
      .select("lead_id")
      .eq("org_id", orgId)
      .eq("to_status", "closed_won")
      .gte("created_at", window.from)
      .limit(2000),
    db
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_test", false)
      .or("status.eq.closed_won,has_net_close.eq.true")
      .gte("updated_at", window.from)
      .limit(2000),
  ]);
  return [...new Set([...(changes ?? []).map((r) => r.lead_id), ...(netClose ?? []).map((r) => r.id)])];
}

type Utterance = { ref: string; callIndex: number; speaker: string; text: string };

function numberedTurns(calls: TranscriptCall[]): Utterance[] {
  const out: Utterance[] = [];
  calls.forEach((call, callIndex) => {
    const turns = parseTurns(call.transcript).filter((turn) => turn.text.trim().length >= 12);
    const picked =
      turns.length > MAX_TURNS_PER_CALL
        ? [...turns.slice(0, MAX_TURNS_PER_CALL / 2), ...turns.slice(-MAX_TURNS_PER_CALL / 2)]
        : turns;
    picked.forEach((turn, i) => {
      out.push({
        ref: `C${callIndex + 1}.${i + 1}`,
        callIndex,
        speaker: turn.speaker === "rep" ? "Rep" : turn.speaker === "prospect" ? "Prospect" : "Speaker",
        text: turn.text.trim().slice(0, MAX_TURN_CHARS),
      });
    });
  });
  return out;
}

const SYSTEM = `You build sales material for one business from its own records.
Rules you never break:
- Use only the numbered excerpts you are given. Never add a framework, a statistic, or a line that is not grounded in them.
- Reference excerpts by their id. Vistrial inserts the exact words; you never retype or reword a quote.
- Write plainly, like an experienced sales manager talking to their team. No hype, no emoji.
- If the excerpts do not support a section, leave it out.`;

const scriptSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().max(400),
  sections: z
    .array(
      z.object({
        heading: z.string().min(2).max(80),
        guidance: z.string().min(10).max(500),
        refs: z.array(z.string()).min(1).max(4),
      })
    )
    .min(2)
    .max(8),
});

export async function createSalesScript(actor: AssetActor, input: { days?: number; focus?: string }): Promise<AssetToolResult> {
  if (!actor.canWriteAssets) return denied();
  const window = windowDays(input.days ?? 180);
  const leadIds = await closedLeadIds(actor.db, actor.orgId, window);
  if (leadIds.length < MIN_SAMPLE_PATTERN) return notEnough(leadIds.length, MIN_SAMPLE_PATTERN, "closed deals");
  const calls = (await loadTranscriptCalls(actor.db, actor.orgId, leadIds, MAX_SCRIPT_CALLS)).filter((c) =>
    c.occurred_at ? c.occurred_at >= window.from : true
  );
  if (calls.length < MIN_SAMPLE_PATTERN) {
    return notEnough(calls.length, MIN_SAMPLE_PATTERN, "call transcripts from deals that closed");
  }

  const utterances = numberedTurns(calls);
  const byRef = new Map(utterances.map((u) => [u.ref, u]));
  const excerpt = calls
    .map((call, index) => {
      const lines = utterances.filter((u) => u.callIndex === index).map((u) => `[${u.ref}] ${u.speaker}: ${u.text}`);
      return `### Call C${index + 1} (${call.type} call, ${fmtDate(call.occurred_at)}, deal closed)\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const { model } = salesOsModel("asset");
  const { output } = await generateText({
    model,
    system: SYSTEM,
    output: Output.object({ schema: scriptSchema }),
    maxOutputTokens: 3000,
    prompt: `Build a talk track from what the rep actually said in these ${calls.length} calls from deals that closed.${
      input.focus ? ` Focus: ${input.focus.slice(0, 200)}.` : ""
    }
Each section is one moment in the call (opening, questions that got prospects talking, how price came up, how next steps were agreed, and so on), in call order.
"guidance" says what the rep did and why it worked, in two or three sentences. "refs" are 1 to 4 excerpt ids, preferably rep lines, that show it.

${excerpt}`,
  });

  const sections = output.sections
    .map((section) => {
      const refs = [...new Set(section.refs)].filter((ref) => byRef.has(ref));
      return { ...section, refs, calls: new Set(refs.map((ref) => byRef.get(ref)!.callIndex)).size };
    })
    .filter((section) => section.refs.length > 0);
  if (sections.length < 2) {
    return notEnough(sections.length, 2, "moments Vistrial could tie to the calls");
  }

  const body = [
    output.summary.trim(),
    ...sections.map((section) =>
      [
        `## ${section.heading.trim()}`,
        section.guidance.trim(),
        ...section.refs.map((ref) => {
          const u = byRef.get(ref)!;
          const call = calls[u.callIndex];
          return `> "${u.text}"\n> — ${u.speaker.toLowerCase()}, ${call.type} call, ${fmtDate(call.occurred_at)}`;
        }),
        `_Seen in ${section.calls} of ${calls.length} closed calls Vistrial read._`,
      ].join("\n\n")
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  const asset = await saveVersion(actor, {
    familyId: null,
    type: "sales_script",
    title: output.title,
    body,
    basis: `Built from ${sampleLabel(calls.length, "call transcript")} in ${sampleLabel(
      new Set(calls.map((c) => c.lead_id)).size,
      "deal"
    )} that closed, ${periodLabel(window)}.`,
    sampleSize: calls.length,
    window,
    evidence: calls.map((call) => ({ kind: "call", callId: call.id, leadId: call.lead_id, occurredAt: call.occurred_at })),
    origin: "agent",
  });
  return { kind: "asset", status: "created", asset, message: "Saved in Vistrial. It hasn't been sent anywhere." };
}

const anglesSchema = z.object({
  title: z.string().min(3).max(120),
  angles: z
    .array(
      z.object({
        name: z.string().min(2).max(80),
        hook: z.string().min(3).max(120),
        copy: z.string().min(10).max(500),
        refs: z.array(z.string()).min(2).max(5),
      })
    )
    .min(2)
    .max(6),
});

export async function createAdAngles(actor: AssetActor, input: { days?: number }): Promise<AssetToolResult> {
  if (!actor.canWriteAssets) return denied();
  const window = windowDays(input.days ?? 120);
  const [quotes, objections] = await Promise.all([
    loadProspectQuotes(actor.db, actor.orgId, window),
    loadObjections(actor.db, actor.orgId, window),
  ]);
  const pool = [
    ...quotes.rows.map((q) => ({ text: q.text, leadId: q.leadId, topic: q.topic })),
    ...objections.rows
      .filter((o) => o.verbatim.trim().length >= 12)
      .map((o) => ({ text: o.verbatim.trim(), leadId: o.lead_id, topic: `${objectionLabel(o.type)} objection` })),
  ];
  const seen = new Set<string>();
  const unique = pool.filter((q) => {
    const key = q.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const prospects = new Set(unique.map((q) => q.leadId).filter(Boolean)).size;
  if (unique.length < MIN_AD_QUOTES) return notEnough(unique.length, MIN_AD_QUOTES, "prospect quotes");
  if (prospects < MIN_SAMPLE_PATTERN) return notEnough(prospects, MIN_SAMPLE_PATTERN, "different prospects quoted");

  const numbered = unique.slice(-150).map((q, i) => ({ ...q, ref: `Q${i + 1}` }));
  const byRef = new Map(numbered.map((q) => [q.ref, q]));
  const { model } = salesOsModel("asset");
  const { output } = await generateText({
    model,
    system: SYSTEM,
    output: Output.object({ schema: anglesSchema }),
    maxOutputTokens: 2500,
    prompt: `These are things this business's prospects said about their own situation, on recorded calls.
Find 2 to 6 ad angles: each is a problem or desire several prospects describe in similar words.
"hook" is a headline in the prospects' language. "copy" is short ad body text built on that language. "refs" are the quote ids it comes from, from at least two different quotes.
Do not promise results the quotes don't support.

${numbered.map((q) => `[${q.ref}] (${q.topic}) "${q.text}"`).join("\n")}`,
  });

  const angles = output.angles
    .map((angle) => {
      const refs = [...new Set(angle.refs)].filter((ref) => byRef.has(ref));
      const people = new Set(refs.map((ref) => byRef.get(ref)!.leadId)).size;
      return { ...angle, refs, people };
    })
    .filter((angle) => angle.refs.length >= 2);
  if (angles.length < 2) return notEnough(angles.length, 2, "angles Vistrial could tie to real quotes");

  const body = angles
    .map((angle) =>
      [
        `## ${angle.name.trim()}`,
        `**Hook:** ${angle.hook.trim()}`,
        angle.copy.trim(),
        "**In their words:**",
        ...angle.refs.map((ref) => `> "${byRef.get(ref)!.text}"`),
        `_From ${sampleLabel(angle.refs.length, "quote")} by ${sampleLabel(angle.people, "prospect")}._`,
      ].join("\n\n")
    )
    .join("\n\n");

  const asset = await saveVersion(actor, {
    familyId: null,
    type: "ad_angles",
    title: output.title,
    body: `${body}\n\n_Copy only. Images and video are not part of this._`,
    basis: `Built from ${sampleLabel(unique.length, "prospect quote")} by ${sampleLabel(prospects, "prospect")}, ${periodLabel(window)}.`,
    sampleSize: unique.length,
    window,
    evidence: angles.flatMap((angle) => angle.refs.map((ref) => ({ kind: "quote", text: byRef.get(ref)!.text, leadId: byRef.get(ref)!.leadId }))),
    origin: "agent",
  });
  return { kind: "asset", status: "created", asset, message: "Saved in Vistrial. It hasn't been sent anywhere." };
}

/** No model call: every number here comes straight from the source comparison. */
export async function createChannelInsights(actor: AssetActor, input: { days?: number }): Promise<AssetToolResult> {
  if (!actor.canWriteAssets) return denied();
  const window = windowDays(input.days ?? 90);
  const data = await loadDataset(actor, window, { touches: false });
  const finding = analyzeSources(data);
  const table = finding.table;
  if (!finding.enough || !table) {
    const comparable = table ? table.rows.filter((row) => Number(row[1]) >= MIN_SAMPLE_PER_GROUP).length : 0;
    return notEnough(comparable, 2, `lead sources with at least ${MIN_SAMPLE_PER_GROUP} leads each`);
  }
  const rows = table.rows.map((row) => ({ name: row[0], leads: Number(row[1]), won: Number(row[5]), revenue: row[7] ?? null }));
  const comparable = rows.filter((row) => row.leads >= MIN_SAMPLE_PER_GROUP);
  const totalLeads = comparable.reduce((sum, row) => sum + row.leads, 0);
  const totalWon = comparable.reduce((sum, row) => sum + row.won, 0);
  const overall = rate(totalWon, totalLeads, "lead");
  const ranked = comparable
    .map((row) => ({ ...row, r: rate(row.won, row.leads, "lead", MIN_SAMPLE_PER_GROUP) }))
    .sort((a, b) => (b.r.pct ?? 0) - (a.r.pct ?? 0));
  const more = ranked.filter((row) => (row.r.pct ?? 0) > (overall.pct ?? 0));
  const less = ranked.filter((row) => (row.r.pct ?? 0) < (overall.pct ?? 0));
  const line = (row: (typeof ranked)[number]) =>
    `- **${row.name}**: ${row.r.pct}% closed (${row.won} of ${sampleLabel(row.leads, "lead")})${row.revenue ? `, ${row.revenue} collected` : ""}`;

  const body = [
    `Across the sources with at least ${MIN_SAMPLE_PER_GROUP} leads, ${overall.pct}% of leads closed (${totalWon} of ${totalLeads}).`,
    "## Worth more investment",
    more.length ? more.map(line).join("\n") : "- None close above the average yet.",
    "## Worth a closer look before spending more",
    less.length ? less.map(line).join("\n") : "- None close below the average.",
    ...(finding.points.length
      ? ["## Spend", ...finding.points.map((point) => `- ${point.label}: ${point.value}${point.detail ? `. ${point.detail}` : ""}`)]
      : []),
    ...(rows.some((row) => row.leads < MIN_SAMPLE_PER_GROUP)
      ? [
          "## Too small to judge",
          rows
            .filter((row) => row.leads < MIN_SAMPLE_PER_GROUP)
            .map((row) => `- ${row.name}: ${sampleLabel(row.leads, "lead")}`)
            .join("\n"),
        ]
      : []),
    "## Read this with care",
    finding.caveats.map((caveat) => `- ${caveat}`).join("\n"),
  ].join("\n\n");

  const asset = await saveVersion(actor, {
    familyId: null,
    type: "channel_insights",
    title: `Where to put acquisition money, ${periodLabel(window)}`,
    body,
    basis: `Built from ${sampleLabel(data.leads.length, "lead")} across ${sampleLabel(rows.length, "source")}, ${periodLabel(window)}.`,
    sampleSize: data.leads.length,
    window,
    evidence: rows.map((row) => ({ kind: "source", source: row.name, leads: row.leads, closed: row.won })),
    origin: "agent",
  });
  return { kind: "asset", status: "created", asset, message: "Saved in Vistrial. It hasn't been sent anywhere." };
}

const answersSchema = z.object({
  title: z.string().min(3).max(120),
  groups: z
    .array(
      z.object({
        objection: z.string().min(2).max(60),
        guidance: z.string().min(10).max(500),
        refs: z.array(z.string()).min(1).max(4),
      })
    )
    .min(1)
    .max(7),
});

export async function createObjectionResponses(actor: AssetActor, input: { days?: number }): Promise<AssetToolResult> {
  if (!actor.canWriteAssets) return denied();
  const window = windowDays(input.days ?? 180);
  const leadIds = await closedLeadIds(actor.db, actor.orgId, window);
  if (leadIds.length < MIN_SAMPLE_PATTERN) return notEnough(leadIds.length, MIN_SAMPLE_PATTERN, "closed deals");

  const callIds: string[] = [];
  const callMeta = new Map<string, { leadId: string; occurredAt: string | null }>();
  for (let i = 0; i < leadIds.length; i += 200) {
    const { data } = await actor.db
      .from("calls")
      .select("id, lead_id, occurred_at")
      .eq("org_id", actor.orgId)
      .in("lead_id", leadIds.slice(i, i + 200))
      .eq("outcome", "held");
    for (const row of data ?? []) {
      callIds.push(row.id);
      callMeta.set(row.id, { leadId: row.lead_id, occurredAt: row.occurred_at });
    }
  }
  const handled = (await loadObjectionHandlings(actor.db, actor.orgId, callIds)).filter(
    (row) => row.handling === "addressed" && row.evidence_span && row.evidence_span.trim().length >= 20
  );
  if (handled.length < MIN_SAMPLE_PATTERN) {
    return notEnough(handled.length, MIN_SAMPLE_PATTERN, "objections your reps answered in deals that closed");
  }

  const numbered = handled.slice(0, 80).map((row, i) => ({ ...row, ref: `H${i + 1}` }));
  const byRef = new Map(numbered.map((row) => [row.ref, row]));
  const { model } = salesOsModel("asset");
  const { output } = await generateText({
    model,
    system: SYSTEM,
    output: Output.object({ schema: answersSchema }),
    maxOutputTokens: 2500,
    prompt: `Each item is an objection a prospect raised, in their words, and what the rep said next, in the rep's words, from deals that later closed.
Group them by objection. For each group, "guidance" says in two or three sentences what the reps did that worked. "refs" are the item ids that show it best.

${numbered
  .map((row) => `[${row.ref}] ${row.objection_type} objection. Prospect: "${row.verbatim}" Rep: "${row.evidence_span}"`)
  .join("\n")}`,
  });

  const groups = output.groups
    .map((group) => ({ ...group, refs: [...new Set(group.refs)].filter((ref) => byRef.has(ref)) }))
    .filter((group) => group.refs.length > 0);
  if (groups.length === 0) return notEnough(0, 1, "objection answers Vistrial could tie to real calls");

  const body = groups
    .map((group) =>
      [
        `## ${group.objection.trim()}`,
        group.guidance.trim(),
        ...group.refs.map((ref) => {
          const row = byRef.get(ref)!;
          const when = fmtDate(callMeta.get(row.call_id)?.occurredAt ?? null);
          return `> **Prospect:** "${row.verbatim}"\n>\n> **Rep:** "${row.evidence_span!.trim()}"\n>\n> — closed deal, ${when}`;
        }),
        `_From ${sampleLabel(group.refs.length, "answered objection")}._`,
      ].join("\n\n")
    )
    .join("\n\n");

  const asset = await saveVersion(actor, {
    familyId: null,
    type: "objection_responses",
    title: output.title,
    body,
    basis: `Built from ${sampleLabel(handled.length, "objection")} your reps answered on ${sampleLabel(
      new Set(handled.map((h) => h.call_id)).size,
      "call"
    )} in deals that closed, ${periodLabel(window)}.`,
    sampleSize: handled.length,
    window,
    evidence: groups.flatMap((group) => group.refs.map((ref) => ({ kind: "handling", callId: byRef.get(ref)!.call_id }))),
    origin: "agent",
  });
  return { kind: "asset", status: "created", asset, message: "Saved in Vistrial. It hasn't been sent anywhere." };
}

export async function listAssets(
  actor: Pick<AssetActor, "db" | "orgId">,
  options: { type?: AssetType; includeOld?: boolean; limit?: number } = {}
): Promise<AssetView[]> {
  let query = actor.db
    .from("sales_os_assets")
    .select("*")
    .eq("org_id", actor.orgId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 30);
  if (options.type) query = query.eq("asset_type", options.type);
  if (!options.includeOld) query = query.eq("status", "current");
  const { data, error } = await query;
  if (error) throw new Error("Couldn't open saved assets.");
  const names = await memberNames(actor.db, actor.orgId);
  return (data ?? []).map((row) => toAssetView(row, names));
}

export async function loadAsset(actor: Pick<AssetActor, "db" | "orgId">, id: string): Promise<AssetView | null> {
  const { data } = await actor.db.from("sales_os_assets").select("*").eq("org_id", actor.orgId).eq("id", id).maybeSingle();
  if (!data) return null;
  return toAssetView(data, await memberNames(actor.db, actor.orgId));
}

export async function assetHistory(actor: Pick<AssetActor, "db" | "orgId">, familyId: string): Promise<AssetView[]> {
  const { data } = await actor.db
    .from("sales_os_assets")
    .select("*")
    .eq("org_id", actor.orgId)
    .eq("family_id", familyId)
    .order("version", { ascending: false });
  const names = await memberNames(actor.db, actor.orgId);
  return (data ?? []).map((row) => toAssetView(row, names));
}

/** An edit is a new version. The old one stays, marked superseded. */
export async function saveAssetEdit(
  actor: AssetActor,
  input: { assetId: string; title: string; body: string }
): Promise<AssetView> {
  if (!actor.canWriteAssets) throw new Error("Only an owner or admin can edit assets.");
  const current = await loadAsset(actor, input.assetId);
  if (!current) throw new Error("That asset isn't in this workspace.");
  if (current.status !== "current") throw new Error("That version has been replaced. Edit the current one.");
  if (!input.body.trim()) throw new Error("An asset can't be empty.");
  const basis = current.basis.startsWith("Edited by")
    ? current.basis.replace(/^Edited by [^.]+ from version \d+\. /, "")
    : current.basis;
  return saveVersion(actor, {
    familyId: current.familyId,
    type: current.type,
    title: input.title.trim() || current.title,
    body: input.body,
    basis: `Edited by ${actor.personName} from version ${current.version}. ${basis}`,
    sampleSize: current.sampleSize,
    window: { from: current.periodStart, to: current.periodEnd },
    evidence: { editedFrom: current.id },
    origin: "edit",
  });
}

export async function markAssetReviewed(actor: AssetActor, assetId: string): Promise<void> {
  if (!actor.canWriteAssets) throw new Error("Only an owner or admin can mark assets reviewed.");
  const { error } = await actor.db
    .from("sales_os_assets")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by_member_id: actor.memberId })
    .eq("org_id", actor.orgId)
    .eq("id", assetId)
    .eq("status", "current");
  if (error) throw new Error("Couldn't mark it reviewed.");
}
