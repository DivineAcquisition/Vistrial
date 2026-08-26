"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import * as React from "react";
import { cn } from "@/lib/utils";

type NativeChange = React.ChangeEventHandler<HTMLInputElement>;

export function Switch({
  className,
  label,
  description,
  name,
  defaultChecked,
  checked,
  onCheckedChange,
  onChange,
  ...props
}: SwitchPrimitive.Root.Props & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  name?: string;
  onChange?: NativeChange;
}): React.ReactElement {
  const [uncontrolled, setUncontrolled] = React.useState(Boolean(defaultChecked));
  const isOn = checked ?? uncontrolled;

  const handleCheckedChange = (
    next: boolean,
    eventDetails: Parameters<NonNullable<SwitchPrimitive.Root.Props["onCheckedChange"]>>[1],
  ) => {
    if (checked === undefined) setUncontrolled(next);
    onCheckedChange?.(next, eventDetails);
    onChange?.({
      target: { checked: next, name: name ?? "", value: "on" },
      currentTarget: { checked: next, name: name ?? "", value: "on" },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const control = (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)] shrink-0 items-center rounded-full p-px outline-none transition-[background-color,box-shadow] duration-200 [--thumb-size:--spacing(5)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-checked:bg-primary data-unchecked:bg-input data-disabled:opacity-64 sm:[--thumb-size:--spacing(4)]",
        !label && className,
      )}
      data-slot="switch"
      {...props}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={handleCheckedChange}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block aspect-square h-full origin-left in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:not-data-disabled:scale-x-110 in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.1)] rounded-(--thumb-size) bg-background shadow-sm/5 will-change-transform [transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s] data-checked:origin-[var(--thumb-size)_50%] data-checked:translate-x-[calc(var(--thumb-size)-4px)]",
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );

  if (!label) {
    return (
      <>
        {name && isOn ? <input type="hidden" name={name} value="on" /> : null}
        {control}
      </>
    );
  }

  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      {name && isOn ? <input type="hidden" name={name} value="on" /> : null}
      <span className="mt-0.5 flex">{control}</span>
      <span className="min-w-0">
        <span className="block text-sm text-white">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-dim">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export { SwitchPrimitive };
