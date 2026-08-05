import { Dot, TonePill, type Tone } from "@/components/ui/tone";
import type { AppointmentStatus, ChargeStatus } from "@/types/database";

/**
 * Ledger statuses mapped onto DA's tone vocabulary. `pending` and `disputed`
 * both need attention, but only a dispute costs money, so they do not share a
 * colour.
 */
const APPOINTMENT_TONES: Record<AppointmentStatus, Tone> = {
  pending: "warning",
  confirmed: "good",
  rejected: "neutral",
  disputed: "critical",
  billed: "brand",
};

const CHARGE_TONES: Record<ChargeStatus, Tone> = {
  draft: "neutral",
  notified: "warning",
  processing: "warning",
  paid: "good",
  failed: "critical",
  credited: "brand",
};

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  return (
    <TonePill tone={APPOINTMENT_TONES[status]} className={className}>
      <Dot tone={APPOINTMENT_TONES[status]} />
      <span className="capitalize">{status}</span>
    </TonePill>
  );
}

export function ChargeStatusBadge({
  status,
  className,
}: {
  status: ChargeStatus;
  className?: string;
}) {
  return (
    <TonePill tone={CHARGE_TONES[status]} className={className}>
      <Dot tone={CHARGE_TONES[status]} />
      <span className="capitalize">{status}</span>
    </TonePill>
  );
}
