import * as React from "react";
import { ChevronDown } from "lucide-react";

import { selectClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * A native select with a visible chevron.
 *
 * Native on purpose: it is keyboard and screen-reader correct for free, and on
 * a phone it opens the platform picker rather than a list that does not scroll.
 */
export function Select({
  className,
  options,
  placeholder,
  children,
  ...props
}: React.ComponentProps<"select"> & {
  options?: SelectOption[];
  /** Rendered as an empty first option. */
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select data-slot="select" className={cn(selectClass, className)} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-dim"
        aria-hidden
      />
    </div>
  );
}
