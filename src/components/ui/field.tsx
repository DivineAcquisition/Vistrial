"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import type React from "react";
import type { ReactNode } from "react";
import { errorClass, helperClass, labelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function FieldRoot({
  className,
  ...props
}: FieldPrimitive.Root.Props): React.ReactElement {
  return (
    <FieldPrimitive.Root
      className={cn("flex flex-col items-start gap-2", className)}
      data-slot="field"
      {...props}
    />
  );
}

export function fieldIds(name: string, id?: string) {
  const fieldId = id ?? name;
  return {
    id: fieldId,
    helpId: `${fieldId}-help`,
    errorId: `${fieldId}-error`,
  };
}

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

export type LabeledFieldProps = {
  label: ReactNode;
  name: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
};

function LabeledField({
  label,
  name,
  htmlFor,
  help,
  error,
  required,
  labelAside,
  className,
  children,
}: LabeledFieldProps) {
  const { id, helpId, errorId } = fieldIds(name, htmlFor);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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

export function Field(props: LabeledFieldProps): React.ReactElement;
export function Field(props: FieldPrimitive.Root.Props): React.ReactElement;
export function Field(
  props: LabeledFieldProps | FieldPrimitive.Root.Props,
): React.ReactElement {
  if ("label" in props && "name" in props && props.label != null) {
    return <LabeledField {...(props as LabeledFieldProps)} />;
  }
  return <FieldRoot {...(props as FieldPrimitive.Root.Props)} />;
}

export function FieldLabel({
  className,
  ...props
}: FieldPrimitive.Label.Props): React.ReactElement {
  return (
    <FieldPrimitive.Label
      className={cn(
        "inline-flex items-center gap-2 font-medium text-base/4.5 text-foreground data-disabled:opacity-64 sm:text-sm/4",
        className,
      )}
      data-slot="field-label"
      {...props}
    />
  );
}

export function FieldItem({
  className,
  ...props
}: FieldPrimitive.Item.Props): React.ReactElement {
  return (
    <FieldPrimitive.Item
      className={cn("flex", className)}
      data-slot="field-item"
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  ...props
}: FieldPrimitive.Description.Props): React.ReactElement {
  return (
    <FieldPrimitive.Description
      className={cn("text-muted-foreground text-xs", className)}
      data-slot="field-description"
      {...props}
    />
  );
}

export function FieldError({
  className,
  ...props
}: FieldPrimitive.Error.Props): React.ReactElement {
  return (
    <FieldPrimitive.Error
      className={cn("text-destructive-foreground text-xs", className)}
      data-slot="field-error"
      {...props}
    />
  );
}

export const FieldControl: typeof FieldPrimitive.Control =
  FieldPrimitive.Control;
export const FieldValidity: typeof FieldPrimitive.Validity =
  FieldPrimitive.Validity;

export { FieldPrimitive };
