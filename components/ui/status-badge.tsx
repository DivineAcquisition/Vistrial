import { Dot, TonePill, type Tone } from "@/components/ui/tone";

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <TonePill tone={tone} className={className}>
      <Dot tone={tone} />
      <span className="capitalize">{label}</span>
    </TonePill>
  );
}
