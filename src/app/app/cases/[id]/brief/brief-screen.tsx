"use client";

import Link from "next/link";

import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Panel } from "@/components/ui/panel";
import { btnSecondary, btnSizeSm } from "@/lib/ui";
import type { BriefPayload } from "@/lib/brief/types";
import {
  CALL_TYPE_LABELS,
  LEAD_TRACK_LABELS,
  OBJECTION_TYPE_LABELS,
} from "@/lib/leads/labels";
import { FACTOR_LABELS } from "@/lib/scoring/compute";
import { formatQueueDuration } from "@/lib/queue/duration";

function gap(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not established";
  return String(value);
}

function objectionSourceLabel(objection: BriefPayload["openObjections"][number]): string {
  if (objection.callOccurredAt) return formatQueueDuration(objection.callOccurredAt);
  if (objection.callType) return CALL_TYPE_LABELS[objection.callType];
  return "source call";
}

export function BriefScreen({ brief }: { brief: BriefPayload }) {
  const score = brief.score;
  const objections = brief.openObjections;
  const quotes = brief.quotes;

  return (
    <div className="brief-sheet grid min-h-0 overflow-x-hidden md:h-[calc(100svh-9rem)] md:grid-rows-[auto_1fr] md:overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-dim">Ninety seconds. Gaps stay visible.</p>
        <div className="flex gap-2">
          <Link href={`/app/cases/${brief.lead.id}`} className={`${btnSecondary} ${btnSizeSm}`}>
            Case file
          </Link>
          <Link
            href={`/app/log?leadId=${brief.lead.id}&from=brief`}
            className={`${btnSecondary} ${btnSizeSm}`}
          >
            Log outcome
          </Link>
          <button type="button" className={`${btnSecondary} ${btnSizeSm}`} onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <div className="grid min-h-0 gap-3 overflow-x-hidden overflow-y-auto md:grid-cols-2 xl:grid-cols-4">
        <Panel className="px-4 py-3 max-md:order-1">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Who</p>
          <p className="mt-1 text-base font-semibold break-words text-white">{brief.lead.name}</p>
          <p className="mt-1 text-xs text-silver">
            {gap(brief.lead.source)}
            {brief.lead.campaign ? ` · ${brief.lead.campaign}` : ""}
          </p>
          <p className="mt-1 text-xs text-dim">{gap(brief.lead.offerName)}</p>
        </Panel>

        <Panel className="px-4 py-3 max-md:order-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Readiness</p>
          {score ? (
            <>
              <p className="mt-1 text-base font-semibold text-white">
                {score.total}
                {brief.lead.leadType ? ` · ${LEAD_TRACK_LABELS[brief.lead.leadType]}` : ""}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-silver">
                {FACTOR_LABELS.timeline} {gap(score.timeline)} · {FACTOR_LABELS.investment_capacity}{" "}
                {gap(score.investmentCapacity)} · {FACTOR_LABELS.decision_authority} {gap(score.decisionAuthority)} ·{" "}
                {FACTOR_LABELS.pain_severity} {gap(score.painSeverity)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-dim">Not established</p>
          )}
        </Panel>

        <Panel className="px-4 py-3 max-md:order-4 xl:col-span-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">
            What the setter established
          </p>
          {brief.setterFacts.length === 0 ? (
            <p className="mt-1 text-sm text-dim">Not established</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-xs text-silver">
              {brief.setterFacts.slice(0, 4).map((fact) => (
                <li key={fact.label}>
                  <span className="text-dim">{fact.label}: </span>
                  {fact.value}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="px-4 py-3 max-md:order-3 md:col-span-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Open objections</p>
          {objections.length === 0 ? (
            <p className="mt-1 text-sm text-dim">Not established</p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs text-silver">
              {objections.map((objection) => (
                <li key={objection.id} className="break-words">
                  <span className="text-white">{OBJECTION_TYPE_LABELS[objection.type]}.</span> “
                  {objection.verbatim}”
                  <span className="text-dim">
                    {" "}
                    ·{" "}
                    {objection.callId ? (
                      <Link href={`/app/calls/${objection.callId}`} className="text-dim underline-offset-2 hover:underline">
                        {objectionSourceLabel(objection)}
                      </Link>
                    ) : (
                      objectionSourceLabel(objection)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Last time</p>
          {brief.lastCall ? (
            <p className="mt-1 text-xs leading-relaxed text-silver">
              {brief.lastCall.summary || "Not established"}
              <span className="mt-1 block text-dim">
                Next step: {brief.lastCall.nextStepAgreed || "Not established"}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-dim">Not established</p>
          )}
        </Panel>

        <Panel className="px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Their words</p>
          {quotes.length === 0 ? (
            <p className="mt-1 text-sm text-dim">Not established</p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs text-silver">
              {quotes.map((quote) => (
                <li key={quote.text}>“{quote.text}”</li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">History</p>
          <DefinitionList>
            <KeyValue label="No-shows">{brief.history.noShowCount}</KeyValue>
            <KeyValue label="Reschedules">{brief.history.rescheduleCount}</KeyValue>
            <KeyValue label="In pipeline">{brief.history.daysInPipeline}d</KeyValue>
            <KeyValue label="Last reply">
              {brief.history.lastInboundAt ? "Inbound received" : "Not established"}
            </KeyValue>
          </DefinitionList>
        </Panel>

        <Panel className="px-4 py-3 xl:col-span-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Suggested opening</p>
          <p className="mt-1 text-sm leading-relaxed text-silver">
            {brief.suggestedOpening || "Not established"}
          </p>
        </Panel>
      </div>
    </div>
  );
}
