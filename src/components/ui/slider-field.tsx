"use client";

import { useState } from "react";

import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

function asSingle(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : Number(value);
}

export function SliderField({
  name,
  value: valueProp,
  defaultValue = 0,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: {
  name?: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label": string;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = valueProp ?? uncontrolled;

  function setValue(next: number) {
    const clamped = Math.min(max, Math.max(min, next));
    if (valueProp === undefined) setUncontrolled(clamped);
    onValueChange?.(clamped);
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <Slider
        aria-label={ariaLabel}
        className="flex-1"
        disabled={disabled}
        max={max}
        min={min}
        onValueChange={(next) => setValue(asSingle(next))}
        step={step}
        value={value}
      />
      <NumberField
        aria-label={`${ariaLabel} value`}
        className={cn("w-16 gap-0", inputClassName)}
        disabled={disabled}
        max={max}
        min={min}
        name={name}
        onValueChange={(next) => setValue(next ?? min)}
        size="sm"
        step={step}
        value={value}
      >
        <NumberFieldGroup>
          <NumberFieldInput />
        </NumberFieldGroup>
      </NumberField>
    </div>
  );
}

export function ScoreRangeSlider({
  min,
  max,
  onCommit,
  className,
}: {
  min: number | null;
  max: number | null;
  onCommit: (next: { scoreMin: number | null; scoreMax: number | null }) => void;
  className?: string;
}) {
  const lo = min ?? 0;
  const hi = max ?? 100;
  const [draft, setDraft] = useState<number[] | null>(null);
  const value = draft ?? [lo, hi];

  function commit(next: number[]) {
    const nextMin = next[0] ?? 0;
    const nextMax = next[1] ?? 100;
    onCommit({
      scoreMin: nextMin <= 0 ? null : nextMin,
      scoreMax: nextMax >= 100 ? null : nextMax,
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Slider
        aria-label="Score range"
        max={100}
        min={0}
        onValueChange={(next) => setDraft(Array.isArray(next) ? [...next] : [lo, hi])}
        onValueCommitted={(next) => {
          const committed = Array.isArray(next) ? [...next] : value;
          setDraft(null);
          commit(committed);
        }}
        value={value}
      />
      <p className="text-xs tabular-nums text-dim">
        {min == null && max == null ? "Any score" : `${value[0]}–${value[1]}`}
      </p>
    </div>
  );
}
