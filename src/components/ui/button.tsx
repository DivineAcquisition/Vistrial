import * as React from "react";
import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  btnDestructive,
  btnGhost,
  btnGradient,
  btnIconLg,
  btnIconMd,
  btnIconSm,
  btnLink,
  btnOutline,
  btnPrimary,
  btnSecondary,
  btnSizeLg,
  btnSizeMd,
  btnSizeSm,
} from "@/lib/ui";

export type ButtonVariant =
  | "primary"
  | "gradient"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link";

export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: btnPrimary,
  gradient: btnGradient,
  secondary: btnSecondary,
  outline: btnOutline,
  ghost: btnGhost,
  destructive: btnDestructive,
  link: btnLink,
};

const SIZES: Record<ButtonSize, string> = {
  sm: btnSizeSm,
  md: btnSizeMd,
  lg: btnSizeLg,
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: btnIconSm,
  md: btnIconMd,
  lg: btnIconLg,
};

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, for a control whose whole label is its icon. */
  iconOnly?: boolean;
  /** Swaps the label for a spinner and blocks a second submit. */
  loading?: boolean;
  /** Read out while loading, so the change is not silent to a screen reader. */
  loadingLabel?: string;
  asChild?: boolean;
};

export type ButtonProps = React.ComponentProps<"button"> & BaseProps;

export function buttonClasses({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  className,
}: BaseProps & { className?: string }): string {
  if (variant === "link") return cn(btnLink, className);
  return cn(VARIANTS[variant], iconOnly ? ICON_SIZES[size] : SIZES[size], className);
}

/**
 * The one button.
 *
 * `iconOnly` deliberately has no visible label, so it requires `aria-label`.
 * Wrap it in a `Tooltip` as well wherever the icon is not universally read.
 */
export function Button({
  className,
  variant = "secondary",
  size = "md",
  iconOnly = false,
  loading = false,
  loadingLabel = "Working",
  asChild = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "true" : undefined}
      className={buttonClasses({ variant, size, iconOnly, className })}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {iconOnly ? <span className="sr-only">{loadingLabel}</span> : <span>{loadingLabel}…</span>}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

/**
 * A button that submits the form it sits in and shows the pending state from
 * `useActionState`. Saves every form repeating the same three props.
 */
export function SubmitButton({
  pending = false,
  children,
  variant = "primary",
  loadingLabel = "Saving",
  ...props
}: Omit<ButtonProps, "type"> & { pending?: boolean }) {
  return (
    <Button type="submit" variant={variant} loading={pending} loadingLabel={loadingLabel} {...props}>
      {children}
    </Button>
  );
}
