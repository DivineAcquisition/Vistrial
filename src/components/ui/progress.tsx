"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type React from "react";
import type { Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

const FILL: Record<Tone, string> = {
  brand: "bg-brand-500",
  neutral: "bg-silver",
  good: "bg-flag-good",
  warning: "bg-flag-warning",
  critical: "bg-flag-critical",
};

type LabeledProgressProps = {
  value: number;
  max?: number;
  label: string;
  /** Overrides the shown figure, e.g. "8 of 26 fields". */
  valueLabel?: string;
  tone?: Tone;
  className?: string;
};

function LabeledProgress({
  value,
  max = 100,
  label,
  valueLabel,
  tone = "brand",
  className,
}: LabeledProgressProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max === 0 ? 0 : Math.round((clamped / max) * 100);

  return (
    <ProgressPrimitive.Root
      value={percent}
      className={cn("flex w-full flex-col gap-2", className)}
      data-slot="progress"
    >
      <div className="flex items-baseline justify-between gap-3">
        <ProgressLabel className="text-xs text-muted-foreground">{label}</ProgressLabel>
        <span className="text-xs tabular-nums text-muted-foreground">
          {valueLabel ?? `${percent}%`}
        </span>
      </div>
      <ProgressTrack>
        <ProgressIndicator className={FILL[tone]} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

export function Progress(props: LabeledProgressProps): React.ReactElement;
export function Progress(props: ProgressPrimitive.Root.Props): React.ReactElement;
export function Progress(
  props: LabeledProgressProps | ProgressPrimitive.Root.Props,
): React.ReactElement {
  if ("label" in props && typeof props.label === "string") {
    return <LabeledProgress {...(props as LabeledProgressProps)} />;
  }

  const { className, children, ...rest } = props as ProgressPrimitive.Root.Props;
  return (
    <ProgressPrimitive.Root
      className={cn("flex w-full flex-col gap-2", className)}
      data-slot="progress"
      {...rest}
    >
      {children ? (
        children
      ) : (
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      )}
    </ProgressPrimitive.Root>
  );
}

export function ProgressLabel({
  className,
  ...props
}: ProgressPrimitive.Label.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Label
      className={cn("font-medium text-sm", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

export function ProgressTrack({
  className,
  ...props
}: ProgressPrimitive.Track.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "block h-1.5 w-full overflow-hidden rounded-full bg-input",
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  );
}

export function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Indicator
      className={cn("bg-primary transition-all duration-500", className)}
      data-slot="progress-indicator"
      {...props}
    />
  );
}

export function ProgressValue({
  className,
  ...props
}: ProgressPrimitive.Value.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Value
      className={cn("text-sm tabular-nums", className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export { ProgressPrimitive };
