"use client";

import type { ReactNode } from "react";
import { Field as FieldPrimitive } from "@base-ui/react/field";
import type React from "react";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Label } from "@/components/ui/label";
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
    <FieldRoot className={cn("w-full", className)} invalid={Boolean(error)}>
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          ) : null}
        </FieldLabel>
        {labelAside}
      </div>
      {children}
      {help ? (
        <FieldDescription id={helpId}>{help}</FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </FieldRoot>
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
    <Label className={cn("flex cursor-pointer items-start gap-3 text-sm", className)}>
      <span className="mt-0.5 flex">{control}</span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </Label>
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
    <FieldRoot className={cn("w-full", className)} invalid={Boolean(error)}>
      <Fieldset className="flex min-w-0 flex-col gap-2">
        <FieldsetLegend>{legend}</FieldsetLegend>
        <div className={cn("grid gap-2.5", cols)}>{children}</div>
        {help ? <FieldDescription>{help}</FieldDescription> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </Fieldset>
    </FieldRoot>
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
        "inline-flex items-center gap-2 font-medium text-base/4.5 text-card-foreground data-disabled:opacity-64 sm:text-sm/4",
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
      className={cn("text-destructive text-xs", className)}
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
