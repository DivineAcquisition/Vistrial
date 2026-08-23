import * as React from "react";
import { Search } from "lucide-react";

import { inputClass, inputCompactClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type FieldDensity = "default" | "compact";

export function Input({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"input"> & { density?: FieldDensity }) {
  return (
    <input
      data-slot="input"
      className={cn(density === "compact" ? inputCompactClass : inputClass, className)}
      {...props}
    />
  );
}

/**
 * An input with something fixed to one end: a currency mark, a unit, a domain.
 * The affix is inside the border so the control still reads as one field.
 */
export function InputGroup({
  prefix,
  suffix,
  className,
  inputClassName,
  density = "default",
  ...props
}: React.ComponentProps<"input"> & {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  inputClassName?: string;
  density?: FieldDensity;
}) {
  if (!prefix && !suffix) {
    return <Input className={cn(className, inputClassName)} density={density} {...props} />;
  }

  return (
    <div
      className={cn(
        density === "compact" ? inputCompactClass : inputClass,
        "field-input-group",
        "has-[input[aria-invalid=true]]:border-flag-critical/60",
        className
      )}
    >
      {prefix ? <span className="field-affix">{prefix}</span> : null}
      <input data-slot="input" className={cn("field-control", inputClassName)} {...props} />
      {suffix ? <span className="field-affix">{suffix}</span> : null}
    </div>
  );
}

/** A search box with the magnifier inside it, for filter bars and tables. */
export function SearchInput({
  className,
  density = "compact",
  "aria-label": ariaLabel = "Search",
  ...props
}: React.ComponentProps<"input"> & { density?: FieldDensity }) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-300/80"
        aria-hidden
      />
      <input
        type="search"
        data-slot="search-input"
        aria-label={ariaLabel}
        className={cn(density === "compact" ? inputCompactClass : inputClass, "pl-9")}
        {...props}
      />
    </div>
  );
}
