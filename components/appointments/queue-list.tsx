"use client";

import { useState } from "react";

import {
  ConfirmButton,
  RejectDialog,
  SettleDisputeDialog,
  ShowButton,
} from "@/components/appointments/decisions";
import { DefinitionPanel } from "@/components/appointments/definition-panel";
import type { AppointmentRow } from "@/components/appointments/types";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { formatDateTime } from "@/lib/format";
import { formatResponse, responseTone } from "@/lib/response-time";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";

const DASH = "\u2014";

export function QueueList({ rows }: { rows: AppointmentRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const disputed = rows.filter((row) => row.status === "disputed");
  const awaitingOutcome = rows.filter(
    (row) => row.status === "pending" && row.awaitingOutcome
  );
  const reviewable = rows.filter((row) => row.status === "pending" && !row.awaitingOutcome);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );

  const allSelected = reviewable.length > 0 && selected.length === reviewable.length;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting."
        detail="Appointments appear here the moment a booking arrives or an admin records one. Nothing is seeded and nothing is sampled — an empty queue means there is no work."
      />
    );
  }

  return (
    <div className="space-y-10">
      {disputed.length > 0 ? (
        <section>
          <SectionHeader
            title="Disputed"
            hint="Billing is held while these sit here, so they come first."
          />
          <ul className="space-y-4">
            {disputed.map((appointment) => (
              <DisputeCard key={appointment.id} appointment={appointment} />
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="Awaiting review"
          hint={`Oldest first. ${reviewable.length} to judge.`}
          actions={
            reviewable.length > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(allSelected ? [] : reviewable.map((row) => row.id))
                  }
                  className={`${btnSecondary} ${btnSizeSm}`}
                >
                  {allSelected ? "Clear" : "Select all"}
                </button>
                {selected.length > 0 ? (
                  <ConfirmButton
                    ids={selected}
                    label={`Confirm ${selected.length} selected`}
                  />
                ) : null}
              </div>
            ) : null
          }
        />

        {reviewable.length === 0 ? (
          <p className="text-sm text-dim">
            Nothing awaiting review. Every booking has been judged.
          </p>
        ) : (
          <ul className="space-y-4">
            {reviewable.map((appointment) => (
              <ReviewCard
                key={appointment.id}
                appointment={appointment}
                selected={selected.includes(appointment.id)}
                onToggle={() => toggle(appointment.id)}
              />
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs leading-relaxed text-dim">
          Confirming in bulk is permitted. Rejecting is not: a rejection needs a
          reason attached to the specific appointment, and one written in bulk
          fails the moment a client asks about it.
        </p>
      </section>

      {awaitingOutcome.length > 0 ? (
        <section>
          <SectionHeader
            title="Awaiting an outcome"
            hint="These clients bill on showed, so nothing here can be confirmed until a show is recorded. They are not unreviewed work."
          />
          <ul className="space-y-4">
            {awaitingOutcome.map((appointment) => (
              <OutcomeCard key={appointment.id} appointment={appointment} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Header({ appointment }: { appointment: AppointmentRow }) {
  const lead = appointment.lead;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">
          {lead?.name ?? "Unnamed lead"}
          <span className="ml-2 text-xs font-normal text-dim">
            {appointment.clientName}
          </span>
        </p>
        <p className="mt-1 text-sm text-silver tabular-nums">
          {lead?.phone ?? DASH}
          {lead?.email ? (
            <span className="ml-2 text-xs text-dim">{lead.email}</span>
          ) : null}
        </p>
      </div>

      <div className="text-right">
        <p className="text-sm font-medium text-white tabular-nums">
          {formatDateTime(appointment.scheduledFor)}
        </p>
        <p className="mt-1 text-xs text-dim">
          {appointment.appointmentType ?? "Job type not declared"}
        </p>
      </div>
    </div>
  );
}

function Facts({ appointment }: { appointment: AppointmentRow }) {
  const lead = appointment.lead;

  return (
    <dl className="mt-3.5 grid gap-3 text-sm sm:grid-cols-4">
      <Fact label="Lead arrived">
        {lead ? formatDateTime(lead.arrivedAt) : DASH}
      </Fact>
      <Fact label="Campaign">{lead?.campaignName ?? "Direct"}</Fact>
      <Fact label="System response">
        <span className={responseClass(appointment.systemMs)}>
          {formatResponse(appointment.systemMs)}
        </span>
      </Fact>
      <Fact label="Human response">
        <span className={responseClass(appointment.humanMs)}>
          {formatResponse(appointment.humanMs)}
        </span>
      </Fact>
    </dl>
  );
}

const TONE_TEXT = {
  good: "text-flag-good",
  warning: "text-flag-warning",
  critical: "text-flag-critical",
  brand: "text-brand-300",
  neutral: "text-white",
} as const;

function responseClass(ms: number | null): string {
  return `tabular-nums ${TONE_TEXT[responseTone(ms)]}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-dim uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-silver tabular-nums">{children}</dd>
    </div>
  );
}

function ReviewCard({
  appointment,
  selected,
  onToggle,
}: {
  appointment: AppointmentRow;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Panel as="li" className="px-5 py-4">
      <div className="flex gap-4">
        <label className="flex shrink-0 items-start pt-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select the appointment for ${appointment.lead?.name ?? "an unnamed lead"}`}
            className="size-4 cursor-pointer accent-brand-700"
          />
        </label>

        <div className="min-w-0 flex-1">
          <Header appointment={appointment} />
          <Facts appointment={appointment} />

          <div className="mt-4">
            <DefinitionPanel
              definition={appointment.definition}
              version={appointment.definitionVersion}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ConfirmButton ids={[appointment.id]} />
            <RejectDialog
              id={appointment.id}
              trigger={
                <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
                  Reject with a reason
                </button>
              }
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OutcomeCard({ appointment }: { appointment: AppointmentRow }) {
  return (
    <Panel as="li" className="px-5 py-4">
      <Header appointment={appointment} />
      <Facts appointment={appointment} />

      <div className="mt-4">
        <DefinitionPanel
          definition={appointment.definition}
          version={appointment.definitionVersion}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ShowButton id={appointment.id} showed label="Record a show" />
        <ShowButton id={appointment.id} showed={false} label="Record a no-show" />
        <RejectDialog
          id={appointment.id}
          trigger={
            <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
              Reject with a reason
            </button>
          }
        />
      </div>
    </Panel>
  );
}

function DisputeCard({ appointment }: { appointment: AppointmentRow }) {
  const dispute = appointment.openDispute;

  return (
    <Panel as="li" className="border-l-2 border-l-flag-critical px-5 py-4">
      <Header appointment={appointment} />

      {dispute ? (
        <div className="mt-3.5 rounded-xl border border-flag-critical/30 bg-flag-critical/[0.06] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone="critical">The client&rsquo;s reason</TonePill>
            <span className="text-xs text-dim tabular-nums">
              raised {formatDateTime(dispute.raisedAt)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-silver">{dispute.reason}</p>
        </div>
      ) : null}

      <Facts appointment={appointment} />

      <div className="mt-4">
        <DefinitionPanel
          definition={appointment.definition}
          version={appointment.definitionVersion}
        />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-dim uppercase">
          Lead history
        </p>
        {appointment.touches.length === 0 ? (
          <p className="text-sm text-dim">
            No contact attempt was ever recorded against this lead.
          </p>
        ) : (
          <ol className="space-y-2">
            {appointment.touches.map((touch) => (
              <li
                key={touch.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white/[0.02] px-3.5 py-2"
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
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SettleDisputeDialog
          id={appointment.id}
          outcome="resolved"
          trigger={
            <button type="button" className={`${btnPrimary} ${btnSizeSm}`}>
              Resolve in our favour
            </button>
          }
        />
        <SettleDisputeDialog
          id={appointment.id}
          outcome="upheld"
          trigger={
            <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
              Uphold the dispute
            </button>
          }
        />
      </div>
    </Panel>
  );
}
