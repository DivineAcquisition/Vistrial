import type {
  CallRow,
  DisqualificationRow,
  LeadRow,
  ObjectionRow,
  ProfileTargets,
  RevenueRow,
  SpendRow,
  StatusChangeRow,
  TouchRow,
  Window,
} from "@/lib/sales-os/data";
import {
  MIN_SAMPLE_PATTERN,
  MIN_SAMPLE_PER_GROUP,
  MIN_SAMPLE_RATE,
  change,
  formatDuration,
  insufficient,
  median,
  rate,
  sampleLabel,
  type Rate,
} from "@/lib/sales-os/stats";
import type { Enums } from "@/types/database";

export type Dataset = {
  window: Window;
  now: string;
  leads: LeadRow[];
  calls: CallRow[];
  objections: ObjectionRow[];
  statusChanges: StatusChangeRow[];
  touches: TouchRow[];
  disqualifications: DisqualificationRow[];
  revenue: { visible: false } | { visible: true; rows: RevenueRow[] };
  spend: { visible: false } | { visible: true; rows: SpendRow[] };
  targets: ProfileTargets;
  /** Reads that hit the row cap. Findings say so rather than pretend to be complete. */
  capped: string[];
};

export type FindingPoint = { label: string; value: string; enough: boolean; detail?: string };
export type FindingTable = { columns: string[]; rows: string[][] };
export type FindingQuote = { text: string; context: string };

/** One statement about the business, with the evidence behind it. */
export type Finding = {
  kind: "finding";
  title: string;
  headline: string;
  enough: boolean;
  sample: string;
  period: { from: string; to: string };
  points: FindingPoint[];
  table?: FindingTable;
  quotes?: FindingQuote[];
  caveats: string[];
};

const DAY = 86_400_000;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function periodLabel(window: Window): string {
  return `${fmtDate(window.from)} to ${fmtDate(window.to)}`;
}

function pct(r: Rate): string {
  return r.enough && r.pct !== null ? `${r.pct}%` : "not enough data";
}

function sourceName(source: string | null): string {
  const trimmed = source?.trim();
  return trimmed ? trimmed : "No source recorded";
}

function inWindow(iso: string | null, window: Window): boolean {
  if (!iso) return false;
  return iso >= window.from && iso < window.to;
}

function cappedCaveat(data: Dataset): string[] {
  return data.capped.length
    ? [`Vistrial read the first ${data.capped.join(", ")} rows it was allowed to and stopped there. Totals may be low.`]
    : [];
}

function immatureCaveat(data: Dataset, leads: LeadRow[]): string[] {
  const cycle = data.targets.salesCycleDays;
  if (!cycle || leads.length === 0) return [];
  const cutoff = new Date(new Date(data.now).getTime() - cycle * DAY).toISOString();
  const young = leads.filter((lead) => lead.opted_in_at > cutoff).length;
  if (young === 0) return [];
  return [
    `${sampleLabel(young, "lead")} arrived inside your ${cycle}-day sales cycle and may still close, so close rates for this period will rise.`,
  ];
}

type LeadStages = {
  reached: boolean;
  booked: boolean;
  held: boolean;
  noShow: boolean;
  won: boolean;
  lost: boolean;
};

function stagesByLead(leads: LeadRow[], calls: CallRow[]): Map<string, LeadStages> {
  const callsByLead = new Map<string, CallRow[]>();
  for (const call of calls) {
    const list = callsByLead.get(call.lead_id) ?? [];
    list.push(call);
    callsByLead.set(call.lead_id, list);
  }
  const out = new Map<string, LeadStages>();
  for (const lead of leads) {
    const leadCalls = callsByLead.get(lead.id) ?? [];
    const won = lead.status === "closed_won" || lead.has_net_close;
    const held = leadCalls.some((call) => call.outcome === "held") || won;
    const booked =
      held ||
      leadCalls.length > 0 ||
      (["call_booked", "no_show", "follow_up", "objection_hold"] as Enums<"lead_status">[]).includes(lead.status);
    out.set(lead.id, {
      reached: Boolean(lead.first_human_touch_at) || booked,
      booked,
      held,
      noShow: leadCalls.some((call) => call.outcome === "no_show"),
      won,
      lost: lead.status === "closed_lost",
    });
  }
  return out;
}

const STEP_LABELS = [
  { key: "reached", label: "Reached by a person", from: "arrived" },
  { key: "booked", label: "Booked a call", from: "reached" },
  { key: "held", label: "Showed up to the call", from: "booked" },
  { key: "won", label: "Closed", from: "held" },
] as const;

export function analyzeFunnel(data: Dataset): Finding {
  const leads = data.leads;
  const stages = stagesByLead(leads, data.calls);
  const counts = {
    arrived: leads.length,
    reached: [...stages.values()].filter((s) => s.reached).length,
    booked: [...stages.values()].filter((s) => s.booked).length,
    held: [...stages.values()].filter((s) => s.held).length,
    won: [...stages.values()].filter((s) => s.won).length,
  };
  const sample = `${sampleLabel(leads.length, "lead")} that arrived ${periodLabel(data.window)}`;
  const base: Omit<Finding, "headline" | "enough" | "points"> = {
    kind: "finding",
    title: "Where leads stop moving",
    sample,
    period: data.window,
    caveats: [...immatureCaveat(data, leads), ...cappedCaveat(data)],
  };

  if (leads.length < MIN_SAMPLE_RATE) {
    return {
      ...base,
      enough: false,
      headline: insufficient(leads.length, MIN_SAMPLE_RATE, "leads in this period").message,
      points: [{ label: "Leads that arrived", value: String(leads.length), enough: false }],
    };
  }

  const steps = STEP_LABELS.map((step) => ({
    ...step,
    rate: rate(counts[step.key], counts[step.from], "lead"),
  }));
  const measurable = steps.filter((step) => step.rate.enough && step.rate.pct !== null);
  const worst = measurable.slice().sort((a, b) => (a.rate.pct ?? 0) - (b.rate.pct ?? 0))[0];

  const lostAt = new Map<string, number>();
  for (const changeRow of data.statusChanges) {
    if (changeRow.to_status !== "closed_lost" && changeRow.to_status !== "ghost") continue;
    if (!stages.has(changeRow.lead_id)) continue;
    lostAt.set(changeRow.from_status, (lostAt.get(changeRow.from_status) ?? 0) + 1);
  }
  const lostRows = [...lostAt.entries()].sort((a, b) => b[1] - a[1]);

  const noShows = [...stages.values()].filter((s) => s.noShow).length;

  return {
    ...base,
    enough: true,
    headline: worst
      ? `The biggest drop is at "${worst.label.toLowerCase()}": ${worst.rate.pct}% of the ${sampleLabel(worst.rate.n, "lead")} who got that far made it through.`
      : "Each step has too few leads to name the weakest one yet.",
    points: [
      { label: "Leads that arrived", value: String(counts.arrived), enough: true },
      ...steps.map((step) => ({
        label: step.label,
        value: `${counts[step.key]} (${pct(step.rate)})`,
        enough: step.rate.enough,
        detail: `${counts[step.key]} of ${sampleLabel(step.rate.n, "lead")} at the step before`,
      })),
      { label: "Missed a booked call at least once", value: String(noShows), enough: true },
    ],
    table: lostRows.length
      ? {
          columns: ["Where they were when they went cold or were lost", "Leads"],
          rows: lostRows.map(([status, count]) => [status.replace(/_/g, " "), String(count)]),
        }
      : undefined,
  };
}

type SourceGroup = {
  name: string;
  leads: number;
  reached: number;
  booked: number;
  held: number;
  won: number;
  revenueCents: number;
};

const PLATFORM_HINTS: Record<string, RegExp> = {
  meta_ads: /\b(meta|facebook|fb|instagram|ig)\b/i,
  google_ads: /\b(google|adwords|youtube)\b/i,
};

export function analyzeSources(data: Dataset): Finding {
  const stages = stagesByLead(data.leads, data.calls);
  const groups = new Map<string, SourceGroup>();
  for (const lead of data.leads) {
    const name = sourceName(lead.source);
    const group = groups.get(name) ?? { name, leads: 0, reached: 0, booked: 0, held: 0, won: 0, revenueCents: 0 };
    const s = stages.get(lead.id);
    group.leads += 1;
    if (s?.reached) group.reached += 1;
    if (s?.booked) group.booked += 1;
    if (s?.held) group.held += 1;
    if (s?.won) group.won += 1;
    groups.set(name, group);
  }
  if (data.revenue.visible) {
    const sourceByLead = new Map(data.leads.map((lead) => [lead.id, sourceName(lead.source)]));
    for (const row of data.revenue.rows) {
      if (!row.lead_id) continue;
      const name = sourceByLead.get(row.lead_id);
      if (!name) continue;
      const group = groups.get(name);
      if (!group) continue;
      group.revenueCents += row.kind === "sale" ? row.amount_cents : row.kind === "refund" || row.kind === "chargeback" ? -row.amount_cents : 0;
    }
  }

  const sorted = [...groups.values()].sort((a, b) => b.leads - a.leads);
  const sample = `${sampleLabel(data.leads.length, "lead")} across ${sampleLabel(sorted.length, "source")}, ${periodLabel(data.window)}`;
  const caveats = [
    "This shows which sources' leads went on to close, not that the source caused it. Offer, timing, and who worked the lead all play a part.",
    ...immatureCaveat(data, data.leads),
    ...cappedCaveat(data),
  ];
  if (!data.revenue.visible) caveats.push("Revenue by source is only shown to owners and admins.");

  const comparable = sorted.filter((group) => group.leads >= MIN_SAMPLE_PER_GROUP);
  const columns = ["Source", "Leads", "Reached", "Booked", "Showed", "Closed", "Close rate"];
  if (data.revenue.visible) columns.push("Revenue");
  const table: FindingTable = {
    columns,
    rows: sorted.map((group) => {
      const r = rate(group.won, group.leads, "lead", MIN_SAMPLE_PER_GROUP);
      const row = [
        group.name,
        String(group.leads),
        String(group.reached),
        String(group.booked),
        String(group.held),
        String(group.won),
        r.enough ? `${r.pct}%` : `under ${MIN_SAMPLE_PER_GROUP} leads`,
      ];
      if (data.revenue.visible) row.push(`$${Math.round(group.revenueCents / 100).toLocaleString("en-US")}`);
      return row;
    }),
  };

  const points: FindingPoint[] = [];
  if (data.spend.visible && data.spend.rows.length) {
    const byPlatform = new Map<string, number>();
    for (const row of data.spend.rows) byPlatform.set(row.platform, (byPlatform.get(row.platform) ?? 0) + row.spend_cents);
    for (const [platform, cents] of byPlatform) {
      const hint = PLATFORM_HINTS[platform];
      const matched = hint ? sorted.filter((group) => hint.test(group.name)) : [];
      const leadsMatched = matched.reduce((sum, group) => sum + group.leads, 0);
      const wonMatched = matched.reduce((sum, group) => sum + group.won, 0);
      const spend = `$${Math.round(cents / 100).toLocaleString("en-US")}`;
      points.push({
        label: `Spend on ${platform.replace(/_/g, " ")}`,
        value: spend,
        enough: leadsMatched >= MIN_SAMPLE_PER_GROUP,
        detail:
          matched.length && leadsMatched >= MIN_SAMPLE_PER_GROUP
            ? `Assuming leads from ${matched.map((g) => `"${g.name}"`).join(", ")} came from this spend: about $${Math.round(cents / 100 / leadsMatched)} a lead${wonMatched ? ` and $${Math.round(cents / 100 / wonMatched)} a close` : ", with no closes yet"}.`
            : "Not enough leads tied to this platform to work out a cost per lead.",
      });
    }
  }

  if (comparable.length < 2) {
    return {
      kind: "finding",
      title: "Which sources turn into customers",
      enough: false,
      headline: `Not enough leads per source to compare them yet: a fair comparison needs at least ${MIN_SAMPLE_PER_GROUP} leads in two or more sources, and ${comparable.length === 1 ? "only one source has that many" : "none do"}.`,
      sample,
      period: data.window,
      points,
      table,
      caveats,
    };
  }

  const byVolume = comparable[0];
  const byClose = comparable
    .map((group) => ({ group, r: rate(group.won, group.leads, "lead", MIN_SAMPLE_PER_GROUP) }))
    .sort((a, b) => (b.r.pct ?? 0) - (a.r.pct ?? 0));
  const best = byClose[0];
  const worst = byClose[byClose.length - 1];
  const volumeRate = rate(byVolume.won, byVolume.leads, "lead", MIN_SAMPLE_PER_GROUP);

  const headline =
    best.group.name === byVolume.name
      ? `${byVolume.name} sends the most leads and also closes best: ${best.r.pct}% of ${sampleLabel(byVolume.leads, "lead")}.`
      : `${byVolume.name} sends the most leads (${byVolume.leads}) but closes ${volumeRate.pct}% of them; ${best.group.name} closes ${best.r.pct}% of ${sampleLabel(best.group.leads, "lead")}.`;

  return {
    kind: "finding",
    title: "Which sources turn into customers",
    enough: true,
    headline,
    sample,
    period: data.window,
    points: [
      ...points,
      ...(worst.group.name !== best.group.name
        ? [
            {
              label: "Lowest close rate with enough leads to judge",
              value: `${worst.group.name}: ${worst.r.pct}%`,
              enough: true,
              detail: `${worst.group.won} of ${sampleLabel(worst.group.leads, "lead")}`,
            },
          ]
        : []),
    ],
    table,
    caveats,
  };
}

const OBJECTION_LABELS: Record<Enums<"objection_type">, string> = {
  price: "Price",
  timing: "Timing",
  spouse_partner: "Needs to ask a partner",
  trust: "Trust",
  fit: "Not sure it fits",
  competitor: "Looking at someone else",
  other: "Other",
};

export function objectionLabel(type: Enums<"objection_type">): string {
  return OBJECTION_LABELS[type];
}

export function analyzeObjections(data: Dataset): Finding {
  const objections = data.objections;
  const leadStatus = new Map(data.leads.map((lead) => [lead.id, lead]));
  const distinctLeads = new Set(objections.map((o) => o.lead_id));
  const sample = `${sampleLabel(objections.length, "objection")} raised by ${sampleLabel(distinctLeads.size, "prospect")}, ${periodLabel(data.window)}`;

  const dqCounts = new Map<string, number>();
  for (const row of data.disqualifications) {
    const key = row.reason.replace(/^"|"$/g, "").slice(0, 120) || "No reason recorded";
    dqCounts.set(key, (dqCounts.get(key) ?? 0) + 1);
  }
  const lostNotes = data.statusChanges
    .filter((row) => row.to_status === "closed_lost" && row.note && row.note.trim().length >= 8)
    .slice(-5)
    .map((row) => ({ text: row.note!.trim(), context: "Your team's note when the deal was marked lost" }));

  const caveats = [
    "Deals that raised an objection and were lost may have been lost for other reasons too. This is what showed up together, not proof of cause.",
    ...cappedCaveat(data),
  ];

  if (objections.length < MIN_SAMPLE_PATTERN) {
    return {
      kind: "finding",
      title: "What prospects push back on",
      enough: false,
      headline: insufficient(objections.length, MIN_SAMPLE_PATTERN, "recorded objections").message,
      sample,
      period: data.window,
      points: dqCounts.size
        ? [...dqCounts.entries()].slice(0, 5).map(([reason, count]) => ({
            label: "Disqualified on intake",
            value: `${count}`,
            enough: count >= MIN_SAMPLE_PATTERN,
            detail: reason,
          }))
        : [],
      quotes: lostNotes,
      caveats,
    };
  }

  const byType = new Map<Enums<"objection_type">, ObjectionRow[]>();
  for (const objection of objections) {
    const list = byType.get(objection.type) ?? [];
    list.push(objection);
    byType.set(objection.type, list);
  }

  const knownOutcome = [...distinctLeads].filter((id) => leadStatus.has(id));
  const overallLost = rate(
    knownOutcome.filter((id) => leadStatus.get(id)?.status === "closed_lost").length,
    knownOutcome.length,
    "prospect",
    MIN_SAMPLE_PATTERN
  );

  const rows = [...byType.entries()]
    .map(([type, list]) => {
      const leads = [...new Set(list.map((o) => o.lead_id))].filter((id) => leadStatus.has(id));
      const lost = leads.filter((id) => leadStatus.get(id)?.status === "closed_lost").length;
      const won = leads.filter((id) => {
        const lead = leadStatus.get(id);
        return lead?.status === "closed_won" || lead?.has_net_close;
      }).length;
      return { type, list, leads: leads.length, lost, won, lostRate: rate(lost, leads.length, "prospect", MIN_SAMPLE_PATTERN) };
    })
    .sort((a, b) => b.list.length - a.list.length);

  const top = rows[0];
  const killer = rows
    .filter((row) => row.lostRate.enough)
    .sort((a, b) => (b.lostRate.pct ?? 0) - (a.lostRate.pct ?? 0))[0];

  const quotes: FindingQuote[] = [];
  for (const row of rows.slice(0, 3)) {
    const recent = row.list.slice(-3).reverse();
    for (const objection of recent.slice(0, 2)) {
      if (objection.verbatim.trim().length < 12) continue;
      quotes.push({ text: objection.verbatim.trim(), context: `${objectionLabel(row.type)} objection` });
    }
  }

  return {
    kind: "finding",
    title: "What prospects push back on",
    enough: true,
    headline: killer
      ? `"${objectionLabel(top.type)}" comes up most (${top.list.length} times). Of prospects who raised "${objectionLabel(killer.type).toLowerCase()}", ${killer.lostRate.pct}% were lost, against ${pct(overallLost)} of everyone who raised any objection.`
      : `"${objectionLabel(top.type)}" comes up most (${top.list.length} times). Too few of these deals have finished to say which objection loses them.`,
    sample,
    period: data.window,
    points: [...dqCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({
        label: "Disqualified on intake",
        value: String(count),
        enough: count >= MIN_SAMPLE_PATTERN,
        detail: reason,
      })),
    table: {
      columns: ["Objection", "Times raised", "Prospects", "Later lost", "Later closed"],
      rows: rows.map((row) => [
        objectionLabel(row.type),
        String(row.list.length),
        String(row.leads),
        row.lostRate.enough ? `${row.lost} (${row.lostRate.pct}%)` : `${row.lost} (too few to rate)`,
        String(row.won),
      ]),
    },
    quotes: [...quotes, ...lostNotes.slice(0, 2)],
    caveats,
  };
}

const RESPONSE_BUCKETS = [
  { label: "Under 5 minutes", max: 5 * 60 },
  { label: "5 to 60 minutes", max: 60 * 60 },
  { label: "1 to 24 hours", max: 24 * 3600 },
  { label: "Over a day", max: Number.POSITIVE_INFINITY },
] as const;

export function analyzeResponseSpeed(data: Dataset): Finding {
  const leads = data.leads;
  const stages = stagesByLead(leads, data.calls);
  const timed = leads.filter((lead) => lead.time_to_first_human_touch_seconds !== null);
  const never = leads.filter((lead) => !lead.first_human_touch_at);
  const med = median(timed.map((lead) => lead.time_to_first_human_touch_seconds as number));
  const targetMin = data.targets.responseTargetMinutes;
  const withinTarget = targetMin
    ? rate(
        timed.filter((lead) => (lead.time_to_first_human_touch_seconds as number) <= targetMin * 60).length,
        leads.length,
        "lead"
      )
    : null;
  const coverage = rate(leads.length - never.length, leads.length, "lead");
  const sample = `${sampleLabel(leads.length, "lead")}, ${sampleLabel(timed.length, "lead")} with a timed first reply, ${periodLabel(data.window)}`;

  const firstChannel = new Map<string, Enums<"touch_channel">>();
  for (const touch of data.touches) {
    if (touch.type !== "human" || touch.direction !== "outbound") continue;
    if (!firstChannel.has(touch.lead_id)) firstChannel.set(touch.lead_id, touch.channel);
  }
  const channelCounts = new Map<string, number>();
  for (const lead of leads) {
    const channel = firstChannel.get(lead.id);
    if (channel) channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
  }

  const caveats = [
    "Faster replies and more booked calls showing up together does not prove one causes the other. Leads that reply quickly may already be keener.",
    ...cappedCaveat(data),
  ];
  if (!targetMin) caveats.push("There is no first-reply target in your business profile, so Vistrial can't say how often you hit it.");

  if (leads.length < MIN_SAMPLE_RATE) {
    return {
      kind: "finding",
      title: "How fast new leads hear from you",
      enough: false,
      headline: insufficient(leads.length, MIN_SAMPLE_RATE, "leads in this period").message,
      sample,
      period: data.window,
      points: [],
      caveats,
    };
  }

  const buckets: Array<{ label: string; n: number; booked: Rate; won: Rate }> = RESPONSE_BUCKETS.map((bucket, index) => {
    const min = index === 0 ? -1 : RESPONSE_BUCKETS[index - 1].max;
    const inBucket = timed.filter((lead) => {
      const s = lead.time_to_first_human_touch_seconds as number;
      return s > min && s <= bucket.max;
    });
    return {
      label: bucket.label,
      n: inBucket.length,
      booked: rate(inBucket.filter((lead) => stages.get(lead.id)?.booked).length, inBucket.length, "lead", MIN_SAMPLE_PER_GROUP),
      won: rate(inBucket.filter((lead) => stages.get(lead.id)?.won).length, inBucket.length, "lead", MIN_SAMPLE_PER_GROUP),
    };
  });
  buckets.push({
    label: "Never reached",
    n: never.length,
    booked: rate(never.filter((lead) => stages.get(lead.id)?.booked).length, never.length, "lead", MIN_SAMPLE_PER_GROUP),
    won: rate(never.filter((lead) => stages.get(lead.id)?.won).length, never.length, "lead", MIN_SAMPLE_PER_GROUP),
  });

  const comparable = buckets.filter((bucket) => bucket.booked.enough);
  let correlation = "Too few leads in each reply-time group to say whether faster replies go with more booked calls here.";
  if (comparable.length >= 2) {
    const fastest = comparable[0];
    const slowest = comparable[comparable.length - 1];
    correlation =
      (fastest.booked.pct ?? 0) > (slowest.booked.pct ?? 0)
        ? `In your own data, leads reached "${fastest.label.toLowerCase()}" booked ${fastest.booked.pct}% of the time, against ${slowest.booked.pct}% for "${slowest.label.toLowerCase()}".`
        : `In your own data, faster replies don't line up with more booked calls: "${fastest.label.toLowerCase()}" booked ${fastest.booked.pct}%, "${slowest.label.toLowerCase()}" ${slowest.booked.pct}%.`;
  }

  return {
    kind: "finding",
    title: "How fast new leads hear from you",
    enough: true,
    headline: `Half of new leads heard from a person within ${formatDuration(med)}. ${never.length} of ${leads.length} never did.${withinTarget?.enough ? ` ${withinTarget.pct}% were reached inside your ${targetMin}-minute target.` : ""}`,
    sample,
    period: data.window,
    points: [
      { label: "Reached by a person", value: pct(coverage), enough: coverage.enough, detail: `${coverage.k} of ${coverage.sample}` },
      { label: "Typical time to first reply", value: formatDuration(med), enough: timed.length >= MIN_SAMPLE_RATE, detail: `Median of ${sampleLabel(timed.length, "lead")}` },
      ...(withinTarget
        ? [{ label: `Reached inside ${targetMin} minutes`, value: pct(withinTarget), enough: withinTarget.enough, detail: `${withinTarget.k} of ${withinTarget.sample}` }]
        : []),
      ...[...channelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([channel, count]) => ({ label: `First reply by ${channel}`, value: String(count), enough: true })),
      { label: "What lines up with booking", value: comparable.length >= 2 ? "see below" : "not enough data", enough: comparable.length >= 2, detail: correlation },
    ],
    table: {
      columns: ["First reply", "Leads", "Booked a call", "Closed"],
      rows: buckets.map((bucket) => [
        bucket.label,
        String(bucket.n),
        bucket.booked.enough ? `${bucket.booked.pct}%` : `under ${MIN_SAMPLE_PER_GROUP} leads`,
        bucket.won.enough ? `${bucket.won.pct}%` : `under ${MIN_SAMPLE_PER_GROUP} leads`,
      ]),
    },
    caveats,
  };
}

export type PeriodMetrics = {
  window: Window;
  leads: number;
  reached: number;
  medianReplySeconds: number | null;
  timedReplies: number;
  callsHeld: number;
  noShows: number;
  closes: number;
  revenueCents: number | null;
  objections: number;
  topSource: string | null;
};

export function periodMetrics(data: Dataset, window: Window): PeriodMetrics {
  const leads = data.leads.filter((lead) => inWindow(lead.opted_in_at, window));
  const timed = leads.filter((lead) => lead.time_to_first_human_touch_seconds !== null);
  const calls = data.calls.filter((call) => inWindow(call.occurred_at ?? call.scheduled_at ?? call.created_at, window));
  const closes = data.statusChanges.filter((row) => row.to_status === "closed_won" && inWindow(row.created_at, window)).length;
  const sources = new Map<string, number>();
  for (const lead of leads) sources.set(sourceName(lead.source), (sources.get(sourceName(lead.source)) ?? 0) + 1);
  const topSource = [...sources.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    window,
    leads: leads.length,
    reached: leads.filter((lead) => lead.first_human_touch_at).length,
    medianReplySeconds: median(timed.map((lead) => lead.time_to_first_human_touch_seconds as number)),
    timedReplies: timed.length,
    callsHeld: calls.filter((call) => call.outcome === "held").length,
    noShows: calls.filter((call) => call.outcome === "no_show").length,
    closes,
    revenueCents: data.revenue.visible
      ? data.revenue.rows
          .filter((row) => inWindow(row.occurred_at, window))
          .reduce((sum, row) => sum + (row.kind === "sale" ? row.amount_cents : row.kind === "failed" ? 0 : -row.amount_cents), 0)
      : null,
    objections: data.objections.filter((row) => inWindow(row.created_at, window)).length,
    topSource,
  };
}

export function comparePeriods(data: Dataset, current: Window, previous: Window): Finding {
  const now = periodMetrics(data, current);
  const before = periodMetrics(data, previous);
  const leads = change(now.leads, before.leads, "lead");
  const held = change(now.callsHeld, before.callsHeld, "held call");
  const closes = change(now.closes, before.closes, "close");
  const enough = now.leads + before.leads >= MIN_SAMPLE_RATE;
  const reachedNow = rate(now.reached, now.leads, "lead");
  const reachedBefore = rate(before.reached, before.leads, "lead");

  const points: FindingPoint[] = [
    { label: "New leads", value: `${now.leads} vs ${before.leads}`, enough: true, detail: leads.sentence },
    {
      label: "Reached by a person",
      value: `${pct(reachedNow)} vs ${pct(reachedBefore)}`,
      enough: reachedNow.enough && reachedBefore.enough,
    },
    {
      label: "Typical time to first reply",
      value: `${formatDuration(now.medianReplySeconds)} vs ${formatDuration(before.medianReplySeconds)}`,
      enough: now.timedReplies >= MIN_SAMPLE_RATE && before.timedReplies >= MIN_SAMPLE_RATE,
      detail: `Medians of ${now.timedReplies} and ${before.timedReplies} timed replies`,
    },
    { label: "Calls held", value: `${now.callsHeld} vs ${before.callsHeld}`, enough: true, detail: held.sentence },
    { label: "Missed calls", value: `${now.noShows} vs ${before.noShows}`, enough: true },
    { label: "Closes", value: `${now.closes} vs ${before.closes}`, enough: true, detail: closes.sentence },
    { label: "Objections recorded", value: `${now.objections} vs ${before.objections}`, enough: true },
  ];
  if (now.revenueCents !== null && before.revenueCents !== null) {
    points.push({
      label: "Revenue collected",
      value: `$${Math.round(now.revenueCents / 100).toLocaleString("en-US")} vs $${Math.round(before.revenueCents / 100).toLocaleString("en-US")}`,
      enough: true,
    });
  }
  if (now.topSource !== before.topSource && now.topSource && before.topSource) {
    points.push({
      label: "Biggest source",
      value: `${now.topSource} (was ${before.topSource})`,
      enough: now.leads >= MIN_SAMPLE_RATE,
    });
  }

  return {
    kind: "finding",
    title: "This period against the one before",
    enough,
    headline: enough
      ? `${leads.sentence} ${closes.sentence}`
      : insufficient(now.leads + before.leads, MIN_SAMPLE_RATE, "leads across the two periods").message,
    sample: `${periodLabel(current)} against ${periodLabel(previous)}`,
    period: current,
    points,
    caveats: [
      "A month-on-month change in small numbers can be noise. Percent changes are only shown when the earlier period had at least 20.",
      ...(now.revenueCents === null ? ["Revenue is only shown to owners and admins."] : []),
      ...cappedCaveat(data),
    ],
  };
}
