"use client";

import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
  type SegmentedControlSize,
} from "@/lib/segmented-control";
import { cn } from "@/lib/utils";

import { RadioGroupPrimitive, RadioPrimitive } from "@/components/ui/radio-group";

export function SegmentedRadioGroup({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  size = "default",
  className,
  name,
  wrap = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  "aria-label": string;
  size?: SegmentedControlSize;
  className?: string;
  name?: string;
  /** Long labels: an option may shrink and wrap its words, so the control never grows wider than its box on a phone. */
  wrap?: boolean;
}) {
  // cn() drops the fixed height, no-shrink and no-wrap classes when the wrap classes replace them.
  const itemClassName = cn(
    segmentedControlItemVariants({ className: "grow", size, state: "checked" }),
    wrap && "h-auto min-h-8 min-w-0 shrink py-1 text-left whitespace-normal sm:h-auto",
  );

  return (
    <RadioGroupPrimitive
      aria-label={ariaLabel}
      className={cn(segmentedControlRootClassName, "flex-wrap", wrap && "max-w-full", className)}
      name={name}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next);
      }}
      value={value}
    >
      {options.map((option) => (
        <RadioPrimitive.Root className={itemClassName} key={option.value} value={option.value}>
          {option.label}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
