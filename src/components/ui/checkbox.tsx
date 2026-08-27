"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import * as React from "react";
import { ChoiceRow } from "@/components/ui/field";
import { radioClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

type NativeChange = React.ChangeEventHandler<HTMLInputElement>;

export function Checkbox({
  className,
  name,
  value = "on",
  defaultChecked,
  checked,
  onCheckedChange,
  onChange,
  ...props
}: CheckboxPrimitive.Root.Props & {
  name?: string;
  value?: string;
  onChange?: NativeChange;
}): React.ReactElement {
  const [uncontrolled, setUncontrolled] = React.useState(Boolean(defaultChecked));
  const isOn = checked ?? uncontrolled;

  const handleCheckedChange = (
    next: boolean,
    eventDetails: Parameters<NonNullable<CheckboxPrimitive.Root.Props["onCheckedChange"]>>[1],
  ) => {
    if (checked === undefined) setUncontrolled(next);
    onCheckedChange?.(next, eventDetails);
    onChange?.({
      target: { checked: next, name: name ?? "", value },
      currentTarget: { checked: next, name: name ?? "", value },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <>
      {name && isOn ? <input type="hidden" name={name} value={value} /> : null}
      <CheckboxPrimitive.Root
        className={cn(
          "relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-[.25rem] border border-white/[0.14] bg-ink-850 not-dark:bg-clip-padding shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none ring-ring transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[3px] not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/48 data-disabled:cursor-not-allowed data-disabled:opacity-64 sm:size-4 dark:not-data-checked:bg-ink-850 dark:aria-invalid:ring-destructive/24 dark:not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)] [[data-disabled],[data-checked],[aria-invalid]]:shadow-none",
          className,
        )}
        data-slot="checkbox"
        {...props}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={handleCheckedChange}
      >
        <CheckboxPrimitive.Indicator
          className="absolute -inset-px flex items-center justify-center rounded-[.25rem] text-primary-foreground data-unchecked:hidden data-checked:bg-primary data-indeterminate:text-foreground"
          data-slot="checkbox-indicator"
          render={(
            indicatorProps: React.ComponentProps<"span">,
            state: CheckboxPrimitive.Indicator.State,
          ) => (
            <span {...indicatorProps}>
              {state.indeterminate ? (
                <svg
                  aria-hidden="true"
                  className="size-3.5 sm:size-3"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5.252 12h13.496" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  className="size-3.5 sm:size-3"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
                </svg>
              )}
            </span>
          )}
        />
      </CheckboxPrimitive.Root>
    </>
  );
}

export function CheckboxField({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<typeof Checkbox> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <ChoiceRow
      className={typeof className === "string" ? className : undefined}
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

export { CheckboxPrimitive };
