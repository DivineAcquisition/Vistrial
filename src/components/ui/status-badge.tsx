import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Dot, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

const TONE_VARIANT: Record<Tone, NonNullable<BadgeProps["variant"]>> = {
  brand: "default",
  neutral: "outline",
  good: "success",
  warning: "warning",
  critical: "error",
};

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
    <Badge
      variant={TONE_VARIANT[tone]}
      className={cn(
        tone === "good" && "text-success",
        tone === "warning" && "text-warning",
        tone === "critical" && "text-destructive",
        className,
      )}
    >
      <Dot tone={tone} />
      <span className="capitalize">{label}</span>
    </Badge>
  );
}
