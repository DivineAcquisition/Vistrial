import type { AppointmentRow } from "@/components/appointments/types";
import { Dot, TonePill } from "@/components/ui/tone";
import { describeWindow, windowTone } from "@/lib/appointments/review-window";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/appointments/status";
import type { AppointmentStatus } from "@/types/database";

export function StatusPill({ status }: { status: AppointmentStatus }) {
  const tone = STATUS_TONES[status];

  return (
    <TonePill tone={tone}>
      <Dot tone={tone} />
      {STATUS_LABELS[status]}
    </TonePill>
  );
}

/** How long the client has left, or that the window has closed and locked. */
export function WindowPill({ appointment }: { appointment: AppointmentRow }) {
  return (
    <TonePill tone={windowTone(appointment.window)}>
      {describeWindow(appointment.window)}
    </TonePill>
  );
}

export function OutcomePill({ appointment }: { appointment: AppointmentRow }) {
  if (appointment.showed === true) return <TonePill tone="good">Showed</TonePill>;
  if (appointment.showed === false) return <TonePill tone="critical">No-show</TonePill>;

  return (
    <TonePill tone={appointment.awaitingOutcome ? "warning" : "neutral"}>
      {appointment.awaitingOutcome ? "Awaiting outcome" : "Outcome not reported"}
    </TonePill>
  );
}
