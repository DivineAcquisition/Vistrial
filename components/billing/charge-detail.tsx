"use client";

import { ResendNoticeButton } from "@/components/billing/actions";
import {
  CHARGE_STATUS_LABELS,
  CHARGE_STATUS_MEANINGS,
  type ChargeRow,
} from "@/components/billing/types";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TonePill, type Tone } from "@/components/ui/tone";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";

const DASH = "\u2014";

const NOTICE_LABELS = {
  pre_charge: "Itemisation before the charge",
  receipt: "Receipt",
  payment_failed: "Payment failed",
  payment_failed_final: "Final attempt failed",
} as const;

export const CHARGE_TONES: Record<ChargeRow["status"], Tone> = {
  draft: "warning",
  notified: "brand",
  processing: "brand",
  paid: "good",
  failed: "critical",
  credited: "neutral",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-dim uppercase">
      {children}
    </h3>
  );
}

/**
 * The full itemisation, the record of what the client was told, every payment
 * attempt with the processor's own reason, and any credit applied.
 */
export function ChargeDetail({ charge }: { charge: ChargeRow }) {
  return (
    <>
      <SheetHeader className="border-b border-border px-5 py-4">
        <SheetTitle className="text-lg text-white">
          {formatMoney(charge.total)} · {charge.clientName}
        </SheetTitle>
        <SheetDescription className="text-dim">
          {formatDay(charge.periodStart)} to {formatDay(charge.periodEnd)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-7 px-5 pb-10">
        <KpiGrid columns={2}>
          <KpiCard
            label="Status"
            value={CHARGE_STATUS_LABELS[charge.status]}
            tone={CHARGE_TONES[charge.status]}
            sub={CHARGE_STATUS_MEANINGS[charge.status]}
          />
          <KpiCard
            label={charge.status === "paid" ? "Collected" : "Scheduled for"}
            value={
              charge.status === "paid"
                ? charge.processedAt
                  ? formatDateTime(charge.processedAt)
                  : DASH
                : charge.scheduledFor
                  ? formatDateTime(charge.scheduledFor)
                  : "Not scheduled"
            }
            tone="neutral"
            sub={
              charge.status === "paid"
                ? (charge.reference ?? undefined)
                : "No earlier than twenty-four hours after the client was told"
            }
          />
        </KpiGrid>

        <section>
          <SectionTitle>Itemisation</SectionTitle>
          <Panel className="px-4 py-2">
            <ul className="divide-y divide-white/[0.05]">
              {charge.lines.length === 0 ? (
                <li className="py-3 text-sm text-dim">
                  No lines were written for this charge.
                </li>
              ) : (
                charge.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-baseline justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 text-sm text-silver">
                      {line.kind === "minimum_adjustment" ? (
                        <TonePill tone="warning" className="mr-2">
                          Minimum
                        </TonePill>
                      ) : null}
                      {line.kind === "credit" ? (
                        <TonePill tone="good" className="mr-2">
                          Credit
                        </TonePill>
                      ) : null}
                      {line.description}
                    </span>
                    <span className="text-sm text-white tabular-nums">
                      {formatMoney(line.amount)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Panel>

          <div className="mt-3">
            <DefinitionList>
              <KeyValue label="Appointments">
                {charge.appointmentCount} at {formatMoney(charge.subtotal)}
              </KeyValue>
              {charge.minimumAdjustment > 0 ? (
                <KeyValue label="Monthly minimum adjustment">
                  {formatMoney(charge.minimumAdjustment)}
                </KeyValue>
              ) : null}
              {charge.creditsApplied > 0 ? (
                <KeyValue label="Credits applied">
                  {formatMoney(-charge.creditsApplied)}
                </KeyValue>
              ) : null}
              <KeyValue label="Total">
                <span className="text-base font-semibold text-white">
                  {formatMoney(charge.total)}
                </span>
              </KeyValue>
              <KeyValue label="Payment method">{charge.card ?? DASH}</KeyValue>
            </DefinitionList>
          </div>
        </section>

        <section>
          <SectionTitle>What the client was told</SectionTitle>
          {charge.notices.length === 0 ? (
            <p className="text-sm text-dim">
              Nothing sent yet. A charge cannot process until the itemisation has
              actually reached the client.
            </p>
          ) : (
            <ol className="space-y-2">
              {charge.notices.map((notice) => (
                <li key={notice.id}>
                  <Panel className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <TonePill
                        tone={
                          notice.status === "sent"
                            ? "good"
                            : notice.status === "failed"
                              ? "critical"
                              : "warning"
                        }
                      >
                        {notice.status === "sent"
                          ? "Delivered"
                          : notice.status === "failed"
                            ? "Not delivered"
                            : "Not sent yet"}
                      </TonePill>
                      <span className="text-sm text-silver">
                        {NOTICE_LABELS[notice.kind]}
                      </span>
                      <span className="text-xs text-dim tabular-nums">
                        {formatDateTime(notice.sentAt ?? notice.createdAt)}
                      </span>
                      <span className="ml-auto text-xs text-dim">
                        {notice.recipient ?? "no recipient on file"}
                      </span>
                    </div>

                    {notice.error ? (
                      <p className="mt-2 text-sm leading-relaxed text-flag-critical">
                        {notice.error}
                      </p>
                    ) : null}

                    {notice.body ? (
                      <details className="mt-2.5 rounded-xl border border-border bg-white/[0.02]">
                        <summary className="cursor-pointer px-3.5 py-2 text-sm text-silver select-none">
                          {notice.subject ?? "Message"}
                        </summary>
                        <pre className="max-h-80 overflow-auto border-t border-border px-3.5 py-3 text-xs leading-relaxed whitespace-pre-wrap text-silver">
                          {notice.body}
                        </pre>
                      </details>
                    ) : null}

                    {notice.status !== "sent" ? (
                      <div className="mt-3">
                        <ResendNoticeButton chargeId={charge.id} />
                      </div>
                    ) : null}
                  </Panel>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <SectionTitle>Payment attempts</SectionTitle>
          {charge.attemptLog.length === 0 ? (
            <p className="text-sm text-dim">Nothing attempted yet.</p>
          ) : (
            <ol className="space-y-2">
              {charge.attemptLog.map((attempt) => (
                <li
                  key={attempt.id}
                  className="rounded-xl border border-border bg-white/[0.02] px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <TonePill tone={attempt.outcome === "succeeded" ? "good" : "critical"}>
                      Attempt {attempt.attemptNo}
                    </TonePill>
                    <span className="text-sm text-silver tabular-nums">
                      {formatDateTime(attempt.attemptedAt)}
                    </span>
                    {attempt.failureCode ? (
                      <span className="ml-auto font-mono text-xs text-dim">
                        {attempt.failureCode}
                      </span>
                    ) : (
                      <span className="ml-auto font-mono text-xs text-dim">
                        {attempt.reference}
                      </span>
                    )}
                  </div>
                  {attempt.failureMessage ? (
                    <p className="mt-2 text-sm leading-relaxed text-silver">
                      {attempt.failureMessage}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {charge.nextAttemptAt ? (
            <p className="mt-3 text-xs text-dim">
              Next automatic attempt {formatDateTime(charge.nextAttemptAt)}.
            </p>
          ) : null}
        </section>

        <section>
          <SectionTitle>Credits applied</SectionTitle>
          {charge.credits.length === 0 ? (
            <p className="text-sm text-dim">None.</p>
          ) : (
            <ol className="space-y-2">
              {charge.credits.map((credit) => (
                <li
                  key={credit.id}
                  className="rounded-xl border border-border bg-white/[0.02] px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <TonePill tone="good">{formatMoney(credit.amount)}</TonePill>
                    <span className="text-xs text-dim tabular-nums">
                      {formatDateTime(credit.createdAt)}
                    </span>
                    <span className="ml-auto text-xs text-dim">
                      {credit.createdByLabel ?? "an admin"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-silver">{credit.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
