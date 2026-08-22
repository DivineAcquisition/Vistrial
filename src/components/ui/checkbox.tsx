import * as React from "react";

import { ChoiceRow } from "@/components/ui/field";
import { checkboxClass, radioClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(checkboxClass, className)}
      {...props}
    />
  );
}

/** A checkbox with its label and optional explanation, as one click target. */
export function CheckboxField({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <ChoiceRow
      className={className}
      control={<Checkbox {...props} />}
      label={label}
      description={description}
    />
  );
}

export function Radio({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input type="radio" data-slot="radio" className={cn(radioClass, className)} {...props} />
  );
}

export function RadioField({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <ChoiceRow
      className={className}
      control={<Radio {...props} />}
      label={label}
      description={description}
    />
  );
}
