"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { Search } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type FieldDensity = "default" | "compact";

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
  density?: FieldDensity;
};

function densitySize(
  density: FieldDensity | undefined,
  size: InputProps["size"],
): InputProps["size"] {
  if (density === "compact") return "sm";
  if (density === "default" && (size === "default" || size === undefined)) return "lg";
  return size;
}

const inputShellClassName =
  "relative inline-flex w-full rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base shadow-xs/5 ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/16 has-aria-invalid:border-destructive/36 has-focus-visible:border-ring has-autofill:bg-foreground/4 has-disabled:opacity-64 has-[:disabled,:focus-visible,[aria-invalid]]:shadow-none has-focus-visible:ring-[3px] sm:text-sm dark:bg-input/32 dark:has-autofill:bg-foreground/8 dark:has-aria-invalid:ring-destructive/24 dark:not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)]";

export function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  density,
  style,
  ...props
}: InputProps): React.ReactElement {
  const resolvedSize = densitySize(density, size);
  const inputClassName = cn(
    "h-8.5 w-full min-w-0 rounded-[inherit] px-[calc(--spacing(3)-1px)] text-foreground leading-8.5 outline-none [transition:background-color_5000000s_ease-in-out_0s] placeholder:text-muted-foreground/72 sm:h-7.5 sm:leading-7.5 autofill:[-webkit-text-fill-color:var(--foreground)]",
    resolvedSize === "sm" &&
      "h-7.5 px-[calc(--spacing(2.5)-1px)] leading-7.5 sm:h-6.5 sm:leading-6.5",
    resolvedSize === "lg" && "h-9.5 leading-9.5 sm:h-8.5 sm:leading-8.5",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
  );

  return (
    <span
      className={cn(!unstyled && inputShellClassName, className) || undefined}
      data-size={resolvedSize}
      data-slot="input-control"
    >
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof resolvedSize === "number" ? resolvedSize : undefined}
          style={typeof style === "function" ? undefined : style}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof resolvedSize === "number" ? resolvedSize : undefined}
          style={style}
          {...props}
        />
      )}
    </span>
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
}: Omit<React.ComponentProps<"input">, "prefix" | "suffix" | "size"> & {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  inputClassName?: string;
  density?: FieldDensity;
}) {
  if (!prefix && !suffix) {
    return (
      <Input className={cn(className, inputClassName)} density={density} nativeInput {...props} />
    );
  }

  const resolvedSize = densitySize(density, "default");

  return (
    <span
      className={cn(inputShellClassName, "items-center", className)}
      data-size={resolvedSize}
      data-slot="input-group"
      role="group"
    >
      {prefix ? (
        <span className="flex items-center ps-[calc(--spacing(3)-1px)] text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <input
        data-slot="input"
        className={cn(
          "h-8.5 w-full min-w-0 bg-transparent px-[calc(--spacing(3)-1px)] text-foreground leading-8.5 outline-none placeholder:text-muted-foreground/72 sm:h-7.5 sm:leading-7.5",
          resolvedSize === "sm" &&
            "h-7.5 px-[calc(--spacing(2.5)-1px)] leading-7.5 sm:h-6.5 sm:leading-6.5",
          resolvedSize === "lg" && "h-9.5 leading-9.5 sm:h-8.5 sm:leading-8.5",
          inputClassName,
        )}
        {...props}
      />
      {suffix ? (
        <span className="flex items-center pe-[calc(--spacing(3)-1px)] text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </span>
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
    <InputGroup
      className={className}
      density={density}
      prefix={<Search className="size-4" aria-hidden="true" />}
      aria-label={ariaLabel}
      type="search"
      {...props}
    />
  );
}

export { InputPrimitive };
