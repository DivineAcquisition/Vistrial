import "server-only";

import { documentPdf } from "@/lib/reporting/pdf";
import { formatCount, formatPerHundred, formatPct, formatSample } from "@/lib/reporting/format";
import type { ReportingRange } from "@/lib/reporting/range";
import { costPerUnit, formatCostUsd } from "@/lib/sources/costs";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function adoptionNames(adoption: Record<string, unknown>, used: boolean): string {
  const members = Array.isArray(adoption.members) ? adoption.members : [];
  const names = members
    .map((row) => asRecord(row))
    .filter((row) => Boolean(row.used) === used)
    .map((row) => str(row.name))
    .filter((name): name is string => Boolean(name));
  if (used) {
    return names.length ? `Used it this period: ${names.join(", ")}.` : "Nobody used the system in this range.";
  }
  return names.length
    ? `Has not used it this period: ${names.join(", ")}.`
    : "Everyone with an operator seat used it in this range.";
}

function rateLine(label: string, value: unknown, perHundred: boolean): string {
  const row = asRecord(value);
  const tooSmall = row.too_small === true;
  const sample = str(row.sample_label) ?? formatSample(num(row.k) ?? 0, num(row.n) ?? 0);
  if (perHundred) {
    return `${label}: ${formatPerHundred(num(row.per_hundred), tooSmall)} (${sample})`;
  }
  return `${label}: ${formatPct(num(row.pct), tooSmall)} (${sample})`;
}

export async function portalPdf(args: {
  orgName: string;
  orgSlug: string;
  range: ReportingRange;
  generatedAt: string;
  summary: string;
  outcome: Record<string, unknown>;
  coverage: Record<string, unknown>;
  terminal: Record<string, unknown>;
  sources: Record<string, unknown>;
  adoption: Record<string, unknown>;
  ads: Record<string, unknown>;
  processor: Record<string, unknown>;
  calendar: Record<string, unknown>;
  forms: Record<string, unknown>;
  recorder: Record<string, unknown>;
}): Promise<Uint8Array> {
  const ads = args.ads;
  const campaigns = Array.isArray(ads.campaigns) ? ads.campaigns : [];
  const adLines =
    ads.connected === true
      ? [
          str(ads.attribution_basis) ?? "",
          str(ads.basis) ?? "",
          ...campaigns.map((row) => {
            const item = asRecord(row);
            const spend = num(item.spend_cents) ?? 0;
            const crmLeads = num(item.crm_leads) ?? 0;
            const crmBooked = num(item.crm_booked) ?? 0;
            const crmClients = num(item.crm_clients) ?? 0;
            const platformLeads = num(item.platform_leads);
            const perLead = costPerUnit({ spendCents: spend, count: crmLeads });
            const perBooked = costPerUnit({ spendCents: spend, count: crmBooked });
            const perClient = costPerUnit({ spendCents: spend, count: crmClients });
            return `${str(item.platform)} ${str(item.campaign_name)}: spend ${formatCostUsd(spend, false)}; CRM leads ${crmLeads} vs platform-reported ${platformLeads ?? "—"}; cost/lead ${formatCostUsd(perLead.cents, perLead.tooSmall)}; cost/booked ${formatCostUsd(perBooked.cents, perBooked.tooSmall)}; cost/client ${formatCostUsd(perClient.cents, perClient.tooSmall)} (CRM net closes, n=${crmClients}). Unattributed leads are not in this row.`;
          }),
          ads.unattributed
            ? `Unattributed CRM leads: ${JSON.stringify(ads.unattributed)}. Not distributed across campaigns.`
            : "",
        ]
      : [str(ads.unlocks) ?? "Ad spend is not connected.", str(ads.basis) ?? ""];

  return documentPdf({
    title: "Owner report",
    subtitle: args.orgName,
    stampParts: [
      args.orgName,
      `Range ${args.range.fromDate} to ${args.range.toDate} (${args.range.key})`,
      `Generated ${args.generatedAt}`,
      `Workspace ${args.orgSlug}`,
    ],
    summaryTitle: "What to do about it",
    summary: args.summary,
    sections: [
      {
        title: "Is it working",
        lines: [
          rateLine("After activation", args.outcome.headline, true),
          args.outcome.baseline
            ? rateLine("Backfilled baseline", args.outcome.baseline, true)
            : "No pre-activation comparison is shown.",
          str(asRecord(args.outcome.comparison).plain) ?? "",
          rateLine("Human touch coverage", args.coverage.ever_touched, false),
          rateLine("Inside the response window", args.coverage.within_window, false),
          args.coverage.speed_to_lead_minutes != null
            ? `Response window: ${args.coverage.speed_to_lead_minutes} minutes. Median ${args.coverage.median_minutes ?? "—"} min, worst case ${args.coverage.worst_case_minutes ?? "—"} min.`
            : "",
          str(args.outcome.attribution) ?? "",
          str(args.outcome.correlation_caveat) ?? "",
        ].filter(Boolean),
      },
      {
        title: "Is the team using it",
        lines: [
          str(args.adoption.basis) ?? "",
          rateLine("Outcome logging", args.adoption.outcome_logging, false),
          rateLine("Briefs opened before calls", args.adoption.briefs_opened_before_calls, false),
          `Drafts approved ${formatCount(num(asRecord(args.adoption.drafts).approved) ?? 0)}, rejected ${formatCount(num(asRecord(args.adoption.drafts).rejected) ?? 0)}`,
          adoptionNames(args.adoption, true),
          adoptionNames(args.adoption, false),
        ].filter(Boolean),
      },
      {
        title: "Where money is leaking",
        lines: [
          bool(args.terminal.too_small)
            ? String(args.terminal.suppressed_plain ?? "Terminal split withheld.")
            : `Terminal n=${formatCount(num(args.terminal.n) ?? 0)}`,
          args.sources.high_readiness_low_close
            ? `High-readiness low-close source: ${JSON.stringify(args.sources.high_readiness_low_close)}`
            : "No high-readiness low-close source flagged.",
          ...adLines,
          args.processor.connected === true
            ? `Processor: sales ${formatCount(num(args.processor.sales) ?? 0)}, refunds ${formatCount(num(args.processor.refunds) ?? 0)}, chargebacks ${formatCount(num(args.processor.chargebacks) ?? 0)}, failed ${formatCount(num(args.processor.failed) ?? 0)}, unmatched ${formatCount(num(args.processor.unmatched) ?? 0)}. ${str(args.processor.basis) ?? ""}`
            : str(args.processor.unlocks) ?? "Processor is not connected.",
          args.calendar.connected === true
            ? `Calendar: booked ${num(args.calendar.booked_minutes) ?? 0} min, no-show ${num(args.calendar.no_show_minutes) ?? 0} min, idle ${args.calendar.idle_minutes == null ? "not measured (availability requires the calendar source)" : `${num(args.calendar.idle_minutes)} min`}. ${str(args.calendar.basis) ?? ""}`
            : str(args.calendar.unlocks) ?? "Calendar is not connected.",
          args.forms.connected === true
            ? `Forms: started ${formatCount(num(args.forms.started) ?? 0)}, completed ${formatCount(num(args.forms.completed) ?? 0)}. ${str(args.forms.basis) ?? ""}`
            : str(args.forms.unlocks) ?? "Form platform is not connected.",
          args.recorder.connected === true
            ? `Recorder: calls made ${formatCount(num(args.recorder.calls_made) ?? 0)}, outcomes logged ${formatCount(num(args.recorder.outcomes_logged) ?? 0)}, gap ${formatCount(num(args.recorder.gap) ?? 0)}. ${rateLine("Connect rate", args.recorder.connect_rate, false)}. ${str(args.recorder.basis) ?? ""}`
            : str(args.recorder.unlocks) ?? "Recorder metadata is not connected.",
        ].filter(Boolean),
      },
    ],
  });
}
