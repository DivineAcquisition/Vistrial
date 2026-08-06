import { TonePill, type Tone } from "@/components/ui/tone";
import type { ClientStatus } from "@/types/database";

const STATUS_TONES: Record<ClientStatus, Tone> = {
  Active: "good",
  Onboarding: "brand",
  Paused: "warning",
  Churned: "neutral",
};

export function ClientStatusBadge({
  status,
  className,
}: {
  status: ClientStatus;
  className?: string;
}) {
  return (
    <TonePill tone={STATUS_TONES[status]} className={className}>
      {status}
    </TonePill>
  );
}
