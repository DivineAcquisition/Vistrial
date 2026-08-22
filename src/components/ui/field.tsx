import type { ReactNode } from "react";

import { errorClass, helperClass, labelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The wrapper every labelled control sits in.
 *
 * It exists to make the wiring impossible to forget: the label points at the
 * control, the help text and the error are announced with it, and an error
 * marks the control invalid so the styling and the screen reader agree.
 *
 * Controls are identified by their `name`, which forms already carry, so a
 * caller does not have to invent an id to get a working label.
 */

export function fieldIds(name: string, id?: string) {
  const fieldId = id ?? name;
  return {
    id: fieldId,
    helpId: `${fieldId}-help`,
    errorId: `${fieldId}-error`,
  };
}

/** What a control needs to be wired to its label, help text and error. */
export function fieldControlProps(args: {
  name: string;
  id?: string;
  help?: ReactNode;
  error?: string | null;
}) {
  const { id, helpId, errorId } = fieldIds(args.name, args.id);
  const describedBy = [args.help ? helpId : null, args.error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    name: args.name,
    "aria-invalid": args.error ? (true as const) : undefined,
    "aria-describedby": describedBy || undefined,
  };
}

export type FieldProps = {
  label: ReactNode;
  /** The control's `name`. Also becomes its id unless `htmlFor` is given. */
  name: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Sits on the label row, for a badge or a "why we ask" note. */
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({
  label,
  name,
  htmlFor,
  help,
  error,
  required,
  labelAside,
  className,
  children,
}: FieldProps) {
  const { id, helpId, errorId } = fieldIds(name, htmlFor);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label className={cn(labelClass, "mb-0")} htmlFor={id}>
          {label}
          {required ? (
            <span className="ml-1 text-flag-critical" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {labelAside}
      </div>
      {children}
      {help ? (
        <p id={helpId} className={helperClass}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={errorClass} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A control whose label sits beside it rather than above: checkboxes, radios
 * and switches. The whole block is the click target.
 */
export function ChoiceRow({
  control,
  label,
  description,
  className,
}: {
  control: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm text-white", className)}>
      <span className="mt-0.5 flex">{control}</span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-dim">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

/** A set of related choices, announced together. */
export function FieldGroup({
  legend,
  help,
  error,
  columns = 2,
  className,
  children,
}: {
  legend: ReactNode;
  help?: ReactNode;
  error?: string | null;
  columns?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={labelClass}>{legend}</legend>
      <div className={cn("grid gap-2.5", cols)}>{children}</div>
      {help ? <p className={helperClass}>{help}</p> : null}
      {error ? (
        <p className={errorClass} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
