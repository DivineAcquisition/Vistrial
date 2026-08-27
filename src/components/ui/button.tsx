"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { resolveAsChild } from "@/lib/as-child";
import { Spinner } from "@/components/ui/spinner";
import {
  buttonClasses,
  buttonVariants,
  resolvedButtonSize,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/button-variants";

export {
  buttonClasses,
  buttonVariants,
  type ButtonSize,
  type ButtonVariant,
};

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  asChild?: boolean;
  iconOnly?: boolean;
}

export function Button({
  className,
  variant = "secondary",
  size = "default",
  render,
  children,
  loading = false,
  loadingLabel,
  disabled: disabledProp,
  asChild = false,
  iconOnly = false,
  ...props
}: ButtonProps): React.ReactElement {
  const isDisabled: boolean = Boolean(loading || disabledProp);
  const slotted = resolveAsChild({ asChild, children, render });
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    slotted.render ? undefined : "button";
  const mappedSize = resolvedButtonSize(size, iconOnly);

  const defaultProps = {
    children: (
      <>
        {slotted.children}
        {loading && (
          <Spinner
            className="pointer-events-none absolute"
            data-slot="button-loading-indicator"
          />
        )}
      </>
    ),
    className: cn(buttonVariants({ className, size: mappedSize, variant })),
    "aria-disabled": loading || undefined,
    "aria-label":
      loading && loadingLabel
        ? loadingLabel
        : (props as { "aria-label"?: string })["aria-label"],
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    disabled: isDisabled,
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render: slotted.render,
  });
}

export function SubmitButton({
  pending = false,
  children,
  variant = "primary",
  loadingLabel = "Saving",
  ...props
}: Omit<ButtonProps, "type"> & { pending?: boolean }) {
  return (
    <Button
      type="submit"
      variant={variant}
      loading={pending}
      loadingLabel={loadingLabel}
      {...props}
    >
      {children}
    </Button>
  );
}
