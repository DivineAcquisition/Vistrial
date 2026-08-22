import * as React from "react";
import { Search } from "lucide-react";

import { inputClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(inputClass, className)} {...props} />;
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
  ...props
}: React.ComponentProps<"input"> & {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  inputClassName?: string;
}) {
  if (!prefix && !suffix) {
    return <Input className={cn(className, inputClassName)} {...props} />;
  }

  return (
    <div
      className={cn(
        "flex min-h-10 w-full items-stretch overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors focus-within:border-brand-500/60 focus-within:ring-2 focus-within:ring-brand-500/20 hover:border-white/20",
        "has-[input[aria-invalid=true]]:border-flag-critical/60",
        "has-[input:disabled]:opacity-50",
        className
      )}
    >
      {prefix ? (
        <span className="flex select-none items-center border-r border-white/[0.07] px-3 text-sm text-dim">
          {prefix}
        </span>
      ) : null}
      <input
        data-slot="input"
        className={cn(
          "min-w-0 flex-1 bg-transparent px-3.5 py-2 text-sm text-white placeholder-dim focus:outline-none disabled:cursor-not-allowed",
          inputClassName
        )}
        {...props}
      />
      {suffix ? (
        <span className="flex select-none items-center border-l border-white/[0.07] px-3 text-sm text-dim">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** A search box with the magnifier inside it, for filter bars and tables. */
export function SearchInput({
  className,
  "aria-label": ariaLabel = "Search",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-dim"
        aria-hidden
      />
      <input
        type="search"
        data-slot="search-input"
        aria-label={ariaLabel}
        className={cn(inputClass, "pl-9")}
        {...props}
      />
    </div>
  );
}
