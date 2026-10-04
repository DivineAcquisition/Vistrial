import "server-only";

import {
  analyzeFunnel,
  analyzeObjections,
  analyzeResponseSpeed,
  analyzeSources,
  comparePeriods,
  periodMetrics,
  type Dataset,
  type Finding,
} from "@/lib/sales-os/analysis";
import {
  CONTEXT_FRESH_MS,
  contextNeedsRefresh,
  parseFingerprint,
  type ContextFingerprint,
} from "@/lib/sales-os/context-cache";
import type { ContextPackage, Leak, OpeningState } from "@/lib/sales-os/context-types";
import { priorWindow, windowDays } from "@/lib/sales-os/data";
import { loadDataset, type Reader } from "@/lib/sales-os/dataset";
import { MIN_SAMPLE_PATTERN, MIN_SAMPLE_RATE, formatDuration, rate, sampleLabel } from "@/lib/sales-os/stats";
import type { Json } from "@/types/database";

export type ContextActor = Reader & {
  memberId: string;
  orgName: string;
  personName: string;
  role: string;
};

function counted(result: { count: number | null; error: { message: string } | null }): number {
  if (result.error) throw new Error(`Could not check for new data: ${result.error.message}`);
  return result.count ?? 0;
}

/** Cheap counts that say whether the data under the cached package has moved. */
export async function readFingerprint(actor: ContextActor): Promise<ContextFingerprint> {
  const { db, orgId } = actor;
  const head = { count: "exact" as const, head: true };
  const [leads, calls, objections, closes, statusChanges, touches, revenue] = await Promise.all([
    db.from("leads").select("id", head).eq("org_id", orgId).eq("is_test", false),
    db.from("calls").select("id", head).eq("org_id", orgId),
    db.from("objections").select("id", head).eq("org_id", orgId),
    db.from("lead_status_changes").select("id", head).eq("org_id", orgId).in("to_status", ["closed_won", "closed_lost"]),
    db.from("lead_status_changes").select("id", head).eq("org_id", orgId),
    db.from("touches").select("id", head).eq("org_id", orgId),
    actor.canSeeMoney ? db.from("revenue_log").select("id", head).eq("org_id", orgId) : Promise.resolve(null),
  ]);
  return {
    leads: counted(leads),
    calls: counted(calls),
    objections: counted(objections),
    closes: counted(closes),
    statusChanges: counted(statusChanges),
    touches: counted(touches),
    revenue: revenue ? counted(revenue) : null,
  };
}

function pct(n: number | null): string {
  return n === null ? "not enough data" : `${n}%`;
}

/**
 * The standing view: where acquisition is leaking, each with the evidence and
 * the sample behind it. Built from the findings, never from a template. A leak
 * only appears when its sample clears the minimum.
 */
export function findLeaks(data: Dataset, findings: { funnel: Finding; sources: Finding; objections: Finding }): Leak[] {
  const leaks: Leak[] = [];
  const leads = data.leads;
  const never = leads.filter((lead) => !lead.first_human_touch_at);
  const coverage = rate(leads.length - never.length, leads.length, "lead");
  if (coverage.enough && coverage.pct !== null && coverage.pct < 90) {
    leaks.push({
      title: "Leads nobody spoke to",
      evidence: `${never.length} of ${leads.length} leads (${Math.round((100 - coverage.pct) * 10) / 10}%) never heard from a person.`,
      sample: coverage.sample,
      ask: "Which leads never heard from anyone, and where did they come from?",
    });
  }

  const target = data.targets.responseTargetMinutes;
  const timed = leads.filter((lead) => lead.time_to_first_human_touch_seconds !== null);
  if (target && timed.length >= MIN_SAMPLE_RATE) {
    const inside = rate(
      timed.filter((lead) => (lead.time_to_first_human_touch_seconds as number) <= target * 60).length,
      timed.length,
      "reached lead"
    );
    if (inside.pct !== null && inside.pct < 60) {
      leaks.push({
        title: "First replies are slower than your target",
        evidence: `${inside.pct}% of reached leads heard back inside your ${target}-minute target.`,
        sample: inside.sample,
        ask: "Does replying faster line up with more booked calls in my data?",
      });
    }
  }

  const funnelWorst = findings.funnel.enough ? findings.funnel.headline : null;
  if (funnelWorst && !/too few/i.test(funnelWorst)) {
    leaks.push({
      title: "The weakest step in the funnel",
      evidence: funnelWorst,
      sample: findings.funnel.sample,
      ask: "Walk me through where leads are dying.",
    });
  }

  if (findings.sources.enough && /but closes/.test(findings.sources.headline)) {
    leaks.push({
      title: "Volume and closes come from different places",
      evidence: findings.sources.headline,
      sample: findings.sources.sample,
      ask: "Which channels deserve more spend?",
    });
  }

  if (findings.objections.enough && /were lost/.test(findings.objections.headline)) {
    leaks.push({
      title: "An objection that loses deals",
      evidence: findings.objections.headline,
      sample: findings.objections.sample,
      ask: "How did my reps answer that objection in deals that closed?",
    });
  }

  const target30 = data.targets.monthlyLeadTarget;
  const last30 = periodMetrics(data, windowDays(30)).leads;
  if (target30 && target30 >= MIN_SAMPLE_RATE && last30 < target30 * 0.8) {
    leaks.push({
      title: "Fewer leads than you planned for",
      evidence: `${last30} leads in the last 30 days against a target of ${target30} a month.`,
      sample: sampleLabel(last30, "lead"),
      ask: "What changed this month against last month?",
    });
  }
  return leaks;
}

function thinReasons(data: Dataset, heldCalls: number, transcripts: number): string[] {
  const reasons: string[] = [];
  if (data.leads.length < MIN_SAMPLE_RATE) {
    reasons.push(`Only ${sampleLabel(data.leads.length, "lead")} in the last 90 days. Rates need at least ${MIN_SAMPLE_RATE}.`);
  }
  if (heldCalls < MIN_SAMPLE_PATTERN) {
    reasons.push(`Only ${sampleLabel(heldCalls, "held call")} in the last 90 days, so there isn't a call pattern to read yet.`);
  }
  if (transcripts < MIN_SAMPLE_PATTERN) {
    reasons.push(
      `Only ${sampleLabel(transcripts, "call transcript")} so far. Talk tracks and objection answers need at least ${MIN_SAMPLE_PATTERN}.`
    );
  }
  return reasons;
}

export async function buildContextPackage(
  actor: ContextActor,
  fingerprint: ContextFingerprint,
  lastConversationAt: string | null
): Promise<ContextPackage> {
  const window90 = windowDays(90);
  const data = await loadDataset(actor, window90);
  const window30 = windowDays(30);
  const prior30 = priorWindow(window30);

  const funnel = analyzeFunnel(data);
  const sources = analyzeSources(data);
  const objections = analyzeObjections(data);
  const response = analyzeResponseSpeed({ ...data, leads: data.leads.filter((l) => l.opted_in_at >= window30.from), window: window30 });
  const month = comparePeriods(data, window30, prior30);

  const heldCalls = data.calls.filter((call) => call.outcome === "held").length;
  const transcripts = data.calls.filter((call) => call.has_transcript).length;
  const closes = data.statusChanges.filter((row) => row.to_status === "closed_won").length;
  const reasons = thinReasons(data, heldCalls, transcripts);

  const bySource = new Map<string, number>();
  for (const lead of data.leads) {
    if (lead.opted_in_at < window30.from) continue;
    const key = lead.source?.trim() || "No source recorded";
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }

  let sinceLast: ContextPackage["sinceLast"] = null;
  if (lastConversationAt) {
    const beyondWindow = lastConversationAt < window90.from;
    const since = beyondWindow ? window90.from : lastConversationAt;
    sinceLast = {
      lastConversationAt,
      beyondWindow,
      newLeads: data.leads.filter((lead) => lead.opted_in_at >= since).length,
      newHeldCalls: data.calls.filter((call) => call.outcome === "held" && (call.occurred_at ?? call.created_at) >= since).length,
      newCloses: data.statusChanges.filter((row) => row.to_status === "closed_won" && row.created_at >= since).length,
      newObjections: data.objections.filter((row) => row.created_at >= since).length,
    };
  }

  return {
    version: 1,
    builtAt: new Date().toISOString(),
    orgName: actor.orgName,
    personName: actor.personName,
    role: actor.role,
    canSeeMoney: actor.canSeeMoney,
    thin: data.leads.length < MIN_SAMPLE_RATE,
    thinReasons: reasons,
    totals: {
      leads90: data.leads.length,
      leads30: periodMetrics(data, window30).leads,
      leadsPrior30: periodMetrics(data, prior30).leads,
      callsHeld90: heldCalls,
      transcripts90: transcripts,
      objections90: data.objections.length,
      closes90: closes,
    },
    targets: {
      monthlyLeadTarget: data.targets.monthlyLeadTarget,
      responseTargetMinutes: data.targets.responseTargetMinutes,
      statedCloseRatePct: data.targets.statedCloseRatePct,
      salesCycleDays: data.targets.salesCycleDays,
    },
    volumeBySource30: [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([source, leads]) => ({ source, leads })),
    funnel,
    sources,
    objections,
    response,
    month,
    sinceLast,
    leaks: findLeaks(data, { funnel, sources, objections }),
    fingerprint,
  };
}

type PackageRow = { id: string; payload: Json; fingerprint: Json; built_at: string };

function asPackage(row: PackageRow | null): ContextPackage | null {
  if (!row) return null;
  const payload = row.payload as unknown as ContextPackage;
  return payload && payload.version === 1 ? payload : null;
}

async function lastConversationBefore(actor: ContextActor, excludeId: string | null): Promise<string | null> {
  let query = actor.db
    .from("sales_os_conversations")
    .select("id, last_message_at, created_at")
    .eq("org_id", actor.orgId)
    .eq("member_id", actor.memberId)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return data?.[0]?.last_message_at ?? null;
}

export type ResolvedContext = { id: string; pkg: ContextPackage; rebuilt: boolean };

/**
 * The context assembly step. Runs before every turn and every fresh
 * conversation; it is not a tool the model chooses. Reuses the cached package
 * unless the data underneath moved meaningfully.
 */
export async function resolveContext(
  actor: ContextActor,
  options: { conversationId: string | null }
): Promise<ResolvedContext> {
  const { data: latest } = await actor.db
    .from("sales_os_context_packages")
    .select("id, payload, fingerprint, built_at")
    .eq("org_id", actor.orgId)
    .eq("member_id", actor.memberId)
    .order("built_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestPkg = asPackage(latest as PackageRow | null);
  if (latest && latestPkg) {
    const age = Date.now() - new Date(latest.built_at).getTime();
    if (age < CONTEXT_FRESH_MS) return { id: latest.id, pkg: latestPkg, rebuilt: false };
  }

  const fingerprint = await readFingerprint(actor);
  if (latest && latestPkg) {
    const decision = contextNeedsRefresh(
      parseFingerprint(latest.fingerprint),
      fingerprint,
      Date.now() - new Date(latest.built_at).getTime()
    );
    if (!decision.refresh) return { id: latest.id, pkg: latestPkg, rebuilt: false };
  }

  const lastAt = await lastConversationBefore(actor, options.conversationId);
  const pkg = await buildContextPackage(actor, fingerprint, lastAt);
  const { data: inserted, error } = await actor.db
    .from("sales_os_context_packages")
    .insert({
      org_id: actor.orgId,
      member_id: actor.memberId,
      fingerprint: fingerprint as unknown as Json,
      payload: pkg as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error("Could not save what Vistrial knows about this workspace.");
  return { id: inserted.id, pkg, rebuilt: true };
}

function findingBlock(finding: Finding): string {
  const lines = [`## ${finding.title}`, `Sample: ${finding.sample}`, `Enough data: ${finding.enough ? "yes" : "no"}`, `Headline: ${finding.headline}`];
  for (const point of finding.points) {
    lines.push(`- ${point.label}: ${point.value}${point.detail ? ` (${point.detail})` : ""}${point.enough ? "" : " [below minimum sample]"}`);
  }
  if (finding.table) {
    lines.push(`Table: ${finding.table.columns.join(" | ")}`);
    for (const row of finding.table.rows.slice(0, 12)) lines.push(`  ${row.join(" | ")}`);
  }
  for (const quote of finding.quotes ?? []) lines.push(`> "${quote.text}" (${quote.context})`);
  for (const caveat of finding.caveats) lines.push(`Caveat: ${caveat}`);
  return lines.join("\n");
}

/** The package as the model reads it. Stable text for a given package, so the prompt cache holds across turns. */
export function renderContextForPrompt(pkg: ContextPackage): string {
  const lines: string[] = [
    `# What Vistrial knows about ${pkg.orgName} right now`,
    `Built ${pkg.builtAt}. You are talking with ${pkg.personName} (${pkg.role}).`,
    pkg.canSeeMoney
      ? "This person can see revenue and ad spend."
      : "This person cannot see revenue or ad spend. Do not estimate or hint at those numbers.",
    "",
    "## Totals, last 90 days",
    `- Leads: ${pkg.totals.leads90} (last 30 days: ${pkg.totals.leads30}; the 30 before: ${pkg.totals.leadsPrior30})`,
    `- Held calls: ${pkg.totals.callsHeld90}; call transcripts: ${pkg.totals.transcripts90}`,
    `- Objections recorded: ${pkg.totals.objections90}; deals closed: ${pkg.totals.closes90}`,
    "",
    "## Targets the client set",
    `- Monthly lead target: ${pkg.targets.monthlyLeadTarget ?? "not set"}`,
    `- First-reply target: ${pkg.targets.responseTargetMinutes ? `${pkg.targets.responseTargetMinutes} minutes` : "not set"}`,
    `- Close rate they believe they have: ${pct(pkg.targets.statedCloseRatePct)}`,
    `- Sales cycle: ${pkg.targets.salesCycleDays ? `${pkg.targets.salesCycleDays} days` : "not set"}`,
    "",
    "## Lead volume by source, last 30 days",
    ...(pkg.volumeBySource30.length ? pkg.volumeBySource30.map((row) => `- ${row.source}: ${row.leads}`) : ["- No leads in the last 30 days."]),
    "",
  ];
  if (pkg.sinceLast) {
    lines.push(
      "## Since this person's last conversation",
      `Last conversation: ${pkg.sinceLast.lastConversationAt}${pkg.sinceLast.beyondWindow ? " (over 90 days ago; counts below cover the last 90 days only)" : ""}`,
      `- New leads: ${pkg.sinceLast.newLeads}; new held calls: ${pkg.sinceLast.newHeldCalls}; new closes: ${pkg.sinceLast.newCloses}; new objections: ${pkg.sinceLast.newObjections}`,
      ""
    );
  } else {
    lines.push("## Since the last conversation", "This is this person's first conversation with Vistrial.", "");
  }
  lines.push(
    findingBlock(pkg.funnel),
    "",
    findingBlock(pkg.response),
    "",
    findingBlock(pkg.sources),
    "",
    findingBlock(pkg.objections),
    "",
    findingBlock(pkg.month),
    "",
    "## Where acquisition is leaking (Vistrial's standing view)"
  );
  if (pkg.leaks.length === 0) {
    lines.push(
      pkg.thin
        ? "No leak can be named yet: there is not enough data."
        : "No leak clears the minimum sample right now. Say so plainly if asked."
    );
  }
  for (const leak of pkg.leaks) lines.push(`- ${leak.title}: ${leak.evidence} (sample: ${leak.sample})`);
  if (pkg.thinReasons.length) {
    lines.push("", "## Where the data is thin", ...pkg.thinReasons.map((reason) => `- ${reason}`));
  }
  return lines.join("\n");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** The opening a fresh conversation shows before anyone types. Deterministic: no model call, no invented insight. */
export function openingFromPackage(pkg: ContextPackage): OpeningState {
  const lines: string[] = [];
  if (pkg.sinceLast && !pkg.sinceLast.beyondWindow) {
    const s = pkg.sinceLast;
    lines.push(
      `Since we last spoke: ${sampleLabel(s.newLeads, "new lead")}, ${sampleLabel(s.newHeldCalls, "held call")}, ${sampleLabel(s.newCloses, "close")}.`
    );
  }
  lines.push(
    `In the last 30 days ${pkg.orgName} had ${sampleLabel(pkg.totals.leads30, "lead")}${pkg.targets.monthlyLeadTarget ? ` against a target of ${pkg.targets.monthlyLeadTarget}` : ""}.`
  );
  if (pkg.response.enough) {
    const typical = pkg.response.points.find((point) => point.label === "Typical time to first reply");
    if (typical) lines.push(`Half of them heard from a person within ${typical.value}.`);
  }
  if (pkg.thin) {
    lines.push("There isn't enough data yet for me to name a pattern with confidence, so I'll say where it's thin rather than guess.");
  } else if (pkg.leaks.length) {
    lines.push(pkg.leaks.length === 1 ? "Here's the leak I'd look at first:" : "Here's where I think acquisition is leaking:");
  } else {
    lines.push("Nothing I can measure clears the bar for a leak right now.");
  }

  const suggestions = pkg.leaks.slice(0, 3).map((leak) => ({ prompt: leak.ask, label: leak.title }));
  if (suggestions.length < 3) {
    for (const fallback of [
      { prompt: "What's going on this month?", label: "What's going on" },
      { prompt: "Write a talk track from the calls we closed.", label: "Talk track from closed calls" },
      { prompt: "Give me ad angles in my prospects' own words.", label: "Ad angles" },
    ]) {
      if (suggestions.length >= 3) break;
      if (!suggestions.some((s) => s.prompt === fallback.prompt)) suggestions.push(fallback);
    }
  }

  return {
    conversationReady: true,
    greetingName: firstName(pkg.personName),
    lines,
    leaks: pkg.leaks,
    thin: pkg.thin,
    thinReasons: pkg.thinReasons,
    builtAt: pkg.builtAt,
    suggestions,
  };
}

export { formatDuration };
