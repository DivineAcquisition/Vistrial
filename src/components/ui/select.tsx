"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { selectClass, selectCompactClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectDensity = "default" | "compact";

/**
 * Radix does not allow an empty string as an item value. Native selects use
 * "" for "any" / placeholder rows, so we map that to a sentinel and back
 * before the value hits a form or an onChange handler.
 */
const EMPTY_ITEM = "__vistrial_empty__";

function toItemValue(value: string) {
  return value === "" ? EMPTY_ITEM : value;
}

function fromItemValue(value: string) {
  return value === EMPTY_ITEM ? "" : value;
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

function optionsFromChildren(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(child)) {
      return;
    }
    if (child.type !== "option") return;
    options.push({
      value: String(child.props.value ?? ""),
      label: textOf(child.props.children),
      disabled: child.props.disabled,
    });
  });
  return options;
}

function fireChange(
  onChange: React.ChangeEventHandler<HTMLSelectElement> | undefined,
  value: string,
  name?: string
) {
  if (!onChange) return;
  const target = { value, name: name ?? "" };
  onChange({
    target,
    currentTarget: target,
  } as React.ChangeEvent<HTMLSelectElement>);
}

function SelectChevron() {
  return (
    <svg className="field-select-chevron" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6.2 8 10l4-3.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A labelled dropdown with the DA field shell and a custom list surface.
 *
 * The public API is still a native select: `name` posts with the form,
 * `onChange` receives `event.target.value`, and `<option>` children work.
 * `density="compact"` is the 40px filter-bar size.
 */
export function Select({
  className,
  options,
  placeholder,
  children,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  name,
  id,
  required,
  disabled,
  form,
  autoComplete,
  density = "default",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: Omit<React.ComponentProps<"select">, "size"> & {
  options?: SelectOption[];
  /** Rendered when the current value is empty and no empty option exists. */
  placeholder?: string;
  density?: SelectDensity;
}) {
  const resolved = React.useMemo(
    () => (options && options.length > 0 ? options : optionsFromChildren(children)),
    [options, children]
  );

  const isControlled = value !== undefined;
  const implicitDefault =
    defaultValue ?? (placeholder !== undefined ? "" : (resolved[0]?.value ?? ""));
  const [internal, setInternal] = React.useState(String(implicitDefault));
  const current = isControlled ? String(value) : internal;

  const handleValueChange = (nextItem: string) => {
    const next = fromItemValue(nextItem);
    if (!isControlled) setInternal(next);
    fireChange(onChange, next, name);
  };

  const selected = resolved.find((option) => option.value === current);
  const emptyLabel = resolved.find((option) => option.value === "")?.label;
  const valuePlaceholder = selected
    ? undefined
    : current === ""
      ? (emptyLabel ?? placeholder ?? "Select")
      : (placeholder ?? "Select");

  const triggerClass = density === "compact" ? selectCompactClass : selectClass;

  return (
    <SelectPrimitive.Root
      value={toItemValue(current)}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
    >
      {name ? (
        <input
          type="hidden"
          name={name}
          value={current}
          required={required}
          disabled={disabled}
          form={form}
          autoComplete={autoComplete}
          readOnly
        />
      ) : null}
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        onBlur={onBlur as React.FocusEventHandler<HTMLButtonElement> | undefined}
        onFocus={onFocus as React.FocusEventHandler<HTMLButtonElement> | undefined}
        className={cn(triggerClass, "group", className)}
      >
        <SelectPrimitive.Value placeholder={valuePlaceholder} className="min-w-0 flex-1 truncate" />
        <SelectPrimitive.Icon asChild>
          <SelectChevron />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "field-select-content z-50 max-h-72 w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] origin-(--radix-select-content-transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center text-brand-300">
            <ChevronUp className="size-3.5" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1.5">
            {resolved.map((option) => (
              <SelectPrimitive.Item
                key={`${option.value}:${option.label}`}
                value={toItemValue(option.value)}
                disabled={option.disabled}
                className="field-select-item"
              >
                <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="field-select-item-indicator">
                  <Check className="size-3.5" strokeWidth={2.4} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center text-brand-300">
            <ChevronDown className="size-3.5" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
