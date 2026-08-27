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
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  "aria-label": string;
  size?: SegmentedControlSize;
  className?: string;
  name?: string;
}) {
  const itemClassName = segmentedControlItemVariants({
    className: "grow",
    size,
    state: "checked",
  });

  return (
    <RadioGroupPrimitive
      aria-label={ariaLabel}
      className={cn(segmentedControlRootClassName, "flex-wrap", className)}
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
