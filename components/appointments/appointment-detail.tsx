"use client";

import {
  ConfirmButton,
  DisputeDialog,
  RejectDialog,
  ResendNotificationButton,
  SettleDisputeDialog,
  ShowButton,
} from "@/components/appointments/decisions";
import { DefinitionPanel } from "@/components/appointments/definition-panel";
import { OutcomePill } from "@/components/appointments/status-pill";
import type {
  AppointmentRow,
  DisputeEntry,
  HistoryEntry,
  NotificationEntry,
} from "@/components/appointments/types";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TonePill } from "@/components/ui/tone";
import { STATUS_LABELS } from "@/lib/appointments/status";
import { formatDateTime, formatMoney } from "@/lib/format";
import { formatResponse, responseTone } from "@/lib/response-time";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";

const DASH = "\u2014";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-dim uppercase">
      {children}
    </h3>
  );
}

/**
 * The evidence file for a single appointment. If a client questions a charge
 * months later, everything needed to answer sits on this one screen.
 */
export function AppointmentDetail({ appointment }: { appointment: AppointmentRow }) {
  const lead = appointment.lead;

  return (
    <>
      <SheetHeader className="border-b border-border px-5 py-4">
        <SheetTitle className="text-lg text-white">
          {lead?.name ?? "Unnamed lead"}
        </SheetTitle>
        <SheetDescription className="text-dim">
          {appointment.clientName} · scheduled {formatDateTime(appointment.scheduledFor)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-7 px-5 pb-10">
        <KpiGrid columns={2}>
          <KpiCard
            label="Status"
            value={STATUS_LABELS[appointment.status]}
            tone={appointment.status === "disputed" ? "critical" : "neutral"}
            sub={appointment.rejectedReason ?? undefined}
          />
          <KpiCard
            label="Review window"
            value={
              appointment.window.state === "open"
                ? "Open"
                : appointment.window.state === "closed"
                  ? "Closed"
                  : appointment.window.state === "held"
                    ? "Held"
                    : appointment.window.state === "billed"
                      ? "Billed"
                      : "Not opened"
            }
            tone="neutral"
            sub={
              appointment.window.state === "open"
                ? `Ends ${formatDateTime(appointment.window.endsAt)}`
                : appointment.window.state === "closed"
                  ? `Closed ${formatDateTime(appointment.window.endsAt)}`
                  : undefined
            }
          />
          <KpiCard
            label="Definition version"
            value={`v${appointment.definitionVersion}`}
            tone="brand"
            sub="Stamped at creation and never changed"
          />
          <KpiCard
            label="Rate"
            value={
              appointment.rate === null
                ? appointment.currentRate === null
                  ? DASH
                  : `${formatMoney(appointment.currentRate)} (would apply)`
                : formatMoney(appointment.rate)
            }
            tone="neutral"
            sub={
              appointment.rate === null
                ? "Stamped when the charge is assembled"
                : "Stamped at assembly, whatever the rate becomes later"
            }
          />
        </KpiGrid>

        <Actions appointment={appointment} />

        <section>
          <SectionTitle>Governing definition</SectionTitle>
          <DefinitionPanel
            definition={appointment.definition}
            version={appointment.definitionVersion}
          />
        </section>

        <section>
          <SectionTitle>Appointment</SectionTitle>
          <DefinitionList>
            <KeyValue label="Scheduled for">
              {formatDateTime(appointment.scheduledFor)}
            </KeyValue>
            <KeyValue label="Job type">{appointment.appointmentType ?? DASH}</KeyValue>
            <KeyValue label="Recorded">
              {appointment.bookingSource === "manual"
                ? "By an admin, by hand"
                : "From the client's calendar"}
              <span className="ml-2 text-xs text-dim">
                {formatDateTime(appointment.createdAt)}
              </span>
            </KeyValue>
            <KeyValue label="Outcome">
              <span className="flex flex-wrap items-center gap-2">
                <OutcomePill appointment={appointment} />
                <span className="text-xs text-dim">
                  Billed on {appointment.billOn}
                </span>
              </span>
            </KeyValue>
            <KeyValue label="Reschedules">
              {appointment.rescheduleCount === 0 ? (
                "None"
              ) : (
                <>
                  {appointment.rescheduleCount}
                  {appointment.previousScheduledFor ? (
                    <span className="ml-2 text-xs text-dim">
                      previously {formatDateTime(appointment.previousScheduledFor)}
                    </span>
                  ) : null}
                </>
              )}
            </KeyValue>
            <KeyValue label="Billable">
              {appointment.billable.billable ? (
                <TonePill tone="good">Ready for billing</TonePill>
              ) : (
                <span className="text-silver">{appointment.billable.reason}</span>
              )}
            </KeyValue>
          </DefinitionList>
        </section>

        <section>
          <SectionTitle>Lead</SectionTitle>
          <KpiGrid columns={3}>
            <KpiCard
              label="System response"
              value={formatResponse(appointment.systemMs)}
              tone={responseTone(appointment.systemMs)}
            />
            <KpiCard
              label="Human response"
              value={formatResponse(appointment.humanMs)}
              tone={responseTone(appointment.humanMs)}
            />
            <KpiCard
              label="Gap"
              value={appointment.gapMs === null ? DASH : formatResponse(appointment.gapMs)}
              tone="neutral"
              sub="Automated to human"
            />
          </KpiGrid>

          <div className="mt-4">
            <DefinitionList>
              <KeyValue label="Name">{lead?.name ?? DASH}</KeyValue>
              <KeyValue label="Phone">{lead?.phone ?? DASH}</KeyValue>
              <KeyValue label="Email">{lead?.email ?? DASH}</KeyValue>
              <KeyValue label="Arrived">
                {lead ? formatDateTime(lead.arrivedAt) : DASH}
                {lead?.origin === "booking" ? (
                  <span className="ml-2 text-xs text-dim">
                    created by the booking, not by an enquiry
                  </span>
                ) : null}
              </KeyValue>
              <KeyValue label="Campaign">
                {lead?.campaignName ?? "Direct — no campaign resolved"}
              </KeyValue>
            </DefinitionList>
          </div>
        </section>

        <section>
          <SectionTitle>Touch history</SectionTitle>
          {appointment.touches.length === 0 ? (
            <p className="text-sm text-dim">No contact attempt recorded.</p>
          ) : (
            <ol className="space-y-2">
              {appointment.touches.map((touch) => (
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
          <SectionTitle>Status history</SectionTitle>
          <History entries={appointment.history} />
        </section>

        <section>
          <SectionTitle>Disputes</SectionTitle>
          <Disputes disputes={appointment.disputes} />
        </section>

        <section>
          <SectionTitle>Client notifications</SectionTitle>
          <Notifications
            notifications={appointment.notifications}
            appointmentId={appointment.id}
          />
        </section>
      </div>
    </>
  );
}

function Actions({ appointment }: { appointment: AppointmentRow }) {
  const buttons: React.ReactNode[] = [];

  if (appointment.status === "pending") {
    if (!appointment.awaitingOutcome) {
      buttons.push(<ConfirmButton key="confirm" ids={[appointment.id]} />);
    }
    buttons.push(
      <RejectDialog
        key="reject"
        id={appointment.id}
        trigger={
          <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
            Reject
          </button>
        }
      />
    );
  }

  if (appointment.status === "confirmed" && appointment.window.state === "open") {
    buttons.push(
      <DisputeDialog
        key="dispute"
        id={appointment.id}
        trigger={
          <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
            Record a dispute
          </button>
        }
      />
    );
  }

  if (appointment.status === "disputed") {
    buttons.push(
      <SettleDisputeDialog
        key="resolve"
        id={appointment.id}
        outcome="resolved"
        trigger={
          <button type="button" className={`${btnPrimary} ${btnSizeSm}`}>
            Resolve
          </button>
        }
      />,
      <SettleDisputeDialog
        key="uphold"
        id={appointment.id}
        outcome="upheld"
        trigger={
          <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
            Uphold
          </button>
        }
      />
    );
  }

  if (appointment.status !== "billed" && appointment.showed === null) {
    buttons.push(
      <ShowButton key="showed" id={appointment.id} showed label="Mark as showed" />,
      <ShowButton
        key="no-show"
        id={appointment.id}
        showed={false}
        label="Mark as a no-show"
      />
    );
  }

  if (buttons.length === 0) return null;

  return <div className="flex flex-wrap items-center gap-2">{buttons}</div>;
}

function History({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-dim">Nothing recorded yet.</p>;
  }

  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-xl border border-border bg-white/[0.02] px-3.5 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone={entry.kind === "status_changed" ? "brand" : "neutral"}>
              {describeEntry(entry)}
            </TonePill>
            <span className="text-xs text-silver tabular-nums">
              {formatDateTime(entry.occurredAt)}
            </span>
            <span className="ml-auto text-xs text-dim">
              {entry.actorLabel ?? entry.actor}
            </span>
          </div>
          {entry.reason ? (
            <p className="mt-2 text-sm leading-relaxed text-silver">{entry.reason}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function describeEntry(entry: HistoryEntry): string {
  switch (entry.kind) {
    case "created":
      return "Created";
    case "status_changed":
      return `${STATUS_LABELS[entry.fromStatus ?? "pending"]} → ${
        STATUS_LABELS[entry.toStatus ?? "pending"]
      }`;
    case "rescheduled":
      return entry.previousScheduledFor
        ? `Rescheduled from ${formatDateTime(entry.previousScheduledFor)}`
        : "Rescheduled";
    case "show_recorded":
      return entry.showed ? "Showed" : "No-show";
  }
}

function Disputes({ disputes }: { disputes: DisputeEntry[] }) {
  if (disputes.length === 0) {
    return <p className="text-sm text-dim">Never disputed.</p>;
  }

  return (
    <ol className="space-y-2">
      {disputes.map((dispute) => (
        <li key={dispute.id}>
          <Panel className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <TonePill tone={dispute.outcome === null ? "critical" : "neutral"}>
                {dispute.outcome === null
                  ? "Open"
                  : dispute.outcome === "upheld"
                    ? "Upheld"
                    : "Resolved"}
              </TonePill>
              <span className="text-xs text-silver tabular-nums">
                Raised {formatDateTime(dispute.raisedAt)}
              </span>
              <span className="ml-auto text-xs text-dim">
                {dispute.raisedBy === "client" ? "By the client" : "By an admin"}
              </span>
            </div>

            <p className="mt-2.5 text-sm leading-relaxed text-silver">{dispute.reason}</p>

            {dispute.outcomeReason ? (
              <p className="mt-2.5 border-t border-border pt-2.5 text-sm leading-relaxed text-silver">
                <span className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
                  Outcome
                </span>
                <br />
                {dispute.outcomeReason}
              </p>
            ) : null}
          </Panel>
        </li>
      ))}
    </ol>
  );
}

function Notifications({
  notifications,
  appointmentId,
}: {
  notifications: NotificationEntry[];
  appointmentId: string;
}) {
  if (notifications.length === 0) {
    return (
      <p className="text-sm text-dim">
        Nothing yet. A record is created the moment the appointment is confirmed.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {notifications.map((notification) => (
        <li key={notification.id}>
          <Panel className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <TonePill
                tone={
                  notification.status === "sent"
                    ? "good"
                    : notification.status === "failed"
                      ? "critical"
                      : "warning"
                }
              >
                {notification.status === "sent"
                  ? "Delivered"
                  : notification.status === "failed"
                    ? "Not delivered"
                    : "Not sent yet"}
              </TonePill>
              <span className="text-xs text-silver tabular-nums">
                {formatDateTime(notification.sentAt ?? notification.createdAt)}
              </span>
              <span className="ml-auto text-xs text-dim">
                {notification.recipient ?? "no recipient on file"}
              </span>
            </div>

            {notification.error ? (
              <p className="mt-2 text-sm leading-relaxed text-flag-critical">
                {notification.error}
              </p>
            ) : null}

            {notification.body ? (
              <details className="mt-2.5 rounded-xl border border-border bg-white/[0.02]">
                <summary className="cursor-pointer px-3.5 py-2 text-sm text-silver select-none">
                  What the client was told
                </summary>
                <pre className="max-h-72 overflow-auto border-t border-border px-3.5 py-3 text-xs leading-relaxed whitespace-pre-wrap text-silver">
                  {notification.body}
                </pre>
              </details>
            ) : null}

            {notification.status !== "sent" ? (
              <div className="mt-3">
                <ResendNotificationButton id={appointmentId} />
              </div>
            ) : null}
          </Panel>
        </li>
      ))}
    </ol>
  );
}
