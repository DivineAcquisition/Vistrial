import type { ReactNode } from "react";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Meter as CossMeter,
  MeterIndicator,
  MeterTrack,
} from "@/components/ui/meter";

/**
 * Status vocabulary ported from the DA hiring site. The brand stays the action
 * colour; the flag tones carry meaning a single hue cannot express, like an
 * overdue escalation versus a healthy one.
 */
export type Tone = "brand" | "neutral" | "good" | "warning" | "critical";

const TONE_VARIANT: Record<Tone, NonNullable<BadgeProps["variant"]>> = {
  brand: "default",
  neutral: "outline",
  good: "success",
  warning: "warning",
  critical: "error",
};

const DOT_CLASSES: Record<Tone, string> = {
  brand: "bg-primary",
  neutral: "bg-muted-foreground",
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

const VALUE_CLASSES: Record<Tone, string> = {
  brand: "text-primary",
  neutral: "text-card-foreground",
  good: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
};

export function toneValueClass(tone: Tone): string {
  return VALUE_CLASSES[tone];
}

export function TonePill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
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
      {children}
    </Badge>
  );
}

export function Dot({ tone = "brand" }: { tone?: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])}
    />
  );
}

export function Meter({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  return (
    <CossMeter value={Math.min(100, Math.max(0, value * 100))} className="gap-0">
      <MeterTrack className="h-1.5 rounded-full">
        <MeterIndicator className={DOT_CLASSES[tone]} />
      </MeterTrack>
    </CossMeter>
  );
}

/** Compliance colouring used consistently wherever a rate is shown. */
export function rateTone(rate: number): Tone {
  if (rate >= 0.9) return "good";
  if (rate >= 0.75) return "warning";
  return "critical";
}

export function RatePill({ rate, label }: { rate: number; label?: string }) {
  return (
    <TonePill tone={rateTone(rate)}>
      {formatPercent(rate)}
      {label ? ` ${label}` : ""}
    </TonePill>
  );
}
