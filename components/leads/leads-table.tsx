"use client";

import { useState } from "react";

import { ResponseValue } from "@/components/leads/response-value";
import type { LeadRowData } from "@/components/leads/types";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dot, TonePill, type Tone } from "@/components/ui/tone";
import { formatDateTime } from "@/lib/format";
import { formatResponse, responseTone } from "@/lib/response-time";
import type { AppointmentStatus, LeadSource } from "@/types/database";

const SOURCE_TONES: Record<LeadSource, Tone> = {
  Paid: "brand",
  Direct: "neutral",
  Referral: "good",
  Organic: "good",
  Other: "neutral",
};

const APPOINTMENT_TONES: Record<AppointmentStatus, Tone> = {
  pending: "warning",
  confirmed: "good",
  rejected: "neutral",
  disputed: "critical",
  billed: "brand",
};

const HEAD_CLASS =
  "h-11 px-4 text-[10px] font-semibold tracking-[0.14em] text-dim uppercase";

const DASH = "\u2014";

export function LeadsTable({ rows }: { rows: LeadRowData[] }) {
  const [selected, setSelected] = useState<LeadRowData | null>(null);

  return (
    <>
      <div className="panel overflow-x-auto rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-secondary hover:bg-secondary">
              <TableHead className={HEAD_CLASS}>Arrived</TableHead>
              <TableHead className={HEAD_CLASS}>Client</TableHead>
              <TableHead className={HEAD_CLASS}>Name</TableHead>
              <TableHead className={HEAD_CLASS}>Contact</TableHead>
              <TableHead className={HEAD_CLASS}>Source</TableHead>
              <TableHead className={HEAD_CLASS}>Campaign</TableHead>
              <TableHead className={`${HEAD_CLASS} text-right`}>System</TableHead>
              <TableHead className={`${HEAD_CLASS} text-right`}>Human</TableHead>
              <TableHead className={HEAD_CLASS}>Appointment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => (
              <TableRow
                key={lead.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${lead.name ?? "unnamed lead"}`}
                onClick={() => setSelected(lead)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                    keyEvent.preventDefault();
                    setSelected(lead);
                  }
                }}
                className="cursor-pointer border-border/60 hover:bg-white/[0.02] focus-visible:bg-white/[0.03] focus-visible:outline-none"
              >
                <TableCell className="px-4 py-3.5 whitespace-nowrap text-silver tabular-nums">
                  {formatDateTime(lead.arrivedAt)}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-silver">
                  {lead.clientName}
                </TableCell>
                <TableCell className="px-4 py-3.5 font-medium text-white">
                  {lead.name ?? "Unnamed"}
                  {lead.submissions.length > 1 ? (
                    <TonePill tone="warning" className="ml-2">
                      {lead.submissions.length} submissions
                    </TonePill>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-silver">
                  <span className="block tabular-nums">{lead.phone ?? DASH}</span>
                  {lead.email ? (
                    <span className="block text-xs text-dim">{lead.email}</span>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  <TonePill tone={SOURCE_TONES[lead.source]}>{lead.source}</TonePill>
                </TableCell>
                <TableCell className="px-4 py-3.5 text-silver">
                  {lead.campaignName ?? DASH}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-right">
                  <ResponseValue ms={lead.systemMs} />
                </TableCell>
                <TableCell className="px-4 py-3.5 text-right">
                  <ResponseValue ms={lead.humanMs} />
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  {lead.appointment ? (
                    <TonePill tone={APPOINTMENT_TONES[lead.appointment.status]}>
                      <Dot tone={APPOINTMENT_TONES[lead.appointment.status]} />
                      <span className="capitalize">{lead.appointment.status}</span>
                    </TonePill>
                  ) : (
                    <span className="text-dim">{DASH}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-border bg-popover sm:max-w-xl"
        >
          {selected ? <LeadDetail lead={selected} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function LeadDetail({ lead }: { lead: LeadRowData }) {
  const repeats = lead.submissions.length - 1;

  return (
    <>
      <SheetHeader className="border-b border-border px-5 py-4">
        <SheetTitle className="text-lg text-white">
          {lead.name ?? "Unnamed lead"}
        </SheetTitle>
        <SheetDescription className="text-dim">
          {lead.clientName} · arrived {formatDateTime(lead.arrivedAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-7 px-5 pb-8">
        <KpiGrid columns={3}>
          <KpiCard
            label="System response"
            value={formatResponse(lead.systemMs)}
            tone={responseTone(lead.systemMs)}
          />
          <KpiCard
            label="Human response"
            value={formatResponse(lead.humanMs)}
            tone={responseTone(lead.humanMs)}
          />
          <KpiCard
            label="Gap"
            value={lead.gapMs === null ? DASH : formatResponse(lead.gapMs)}
            tone="neutral"
            sub="Automated to human"
          />
        </KpiGrid>

        <section>
          <SheetSectionTitle>Lead</SheetSectionTitle>
          <DefinitionList>
            <KeyValue label="Phone">{lead.phone ?? DASH}</KeyValue>
            <KeyValue label="Email">{lead.email ?? DASH}</KeyValue>
            <KeyValue label="Job type">{lead.jobType ?? DASH}</KeyValue>
            <KeyValue label="Source">{lead.source}</KeyValue>
            <KeyValue label="Campaign">
              {lead.campaignName ?? "Direct — no campaign resolved"}
            </KeyValue>
            <KeyValue label="Arrival timestamp">
              {formatDateTime(lead.arrivedAt)}
              <span className="ml-2 text-xs text-dim">
                {lead.arrivalSource === "payload"
                  ? "from the provider payload"
                  : "from the moment of receipt"}
              </span>
            </KeyValue>
            <KeyValue label="Appointment">
              {lead.appointment
                ? `${lead.appointment.status} · ${formatDateTime(lead.appointment.scheduledFor)}`
                : "None linked"}
            </KeyValue>
          </DefinitionList>
        </section>

        <section>
          <SheetSectionTitle>Touch history</SheetSectionTitle>
          {lead.touches.length === 0 ? (
            <p className="text-sm text-dim">
              No contact attempt recorded yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {lead.touches.map((touch) => (
                <li
                  key={touch.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white/[0.02] px-3.5 py-2.5"
                >
                  <TonePill tone={touch.type === "system" ? "brand" : "good"}>
                    {touch.type === "system" ? "System" : "Human"}
                  </TonePill>
                  <span className="text-sm text-silver tabular-nums">
                    {formatDateTime(touch.occurredAt)}
                  </span>
                  <span className="text-xs text-dim">
                    {touch.channel ?? "channel not declared"}
                  </span>
                  {touch.isFirstOfType ? (
                    <span className="ml-auto text-[11px] font-semibold tracking-[0.12em] text-brand-300 uppercase">
                      First of type
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <SheetSectionTitle>Submissions</SheetSectionTitle>
          <p className="mb-2.5 text-xs text-dim">
            {repeats > 0
              ? `This person submitted ${lead.submissions.length} times. The original kept its arrival time and its touches.`
              : "One submission."}
          </p>
          <ol className="space-y-2">
            {lead.submissions.map((submission) => (
              <li
                key={submission.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.02] px-3.5 py-2.5"
              >
                <TonePill tone={submission.isOriginal ? "neutral" : "warning"}>
                  {submission.isOriginal ? "Original" : "Repeat"}
                </TonePill>
                <span className="text-sm text-silver tabular-nums">
                  {formatDateTime(submission.submittedAt)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <SheetSectionTitle>Original payload</SheetSectionTitle>
          <details className="rounded-xl border border-border bg-white/[0.02]">
            <summary className="cursor-pointer px-3.5 py-2.5 text-sm text-silver select-none">
              Show the payload exactly as it arrived
            </summary>
            <pre className="max-h-80 overflow-auto border-t border-border px-3.5 py-3 text-xs leading-relaxed text-silver">
              {lead.payload}
            </pre>
          </details>
        </section>
      </div>
    </>
  );
}

function SheetSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-dim uppercase">
      {children}
    </h3>
  );
}
