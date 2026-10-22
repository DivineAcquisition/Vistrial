import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium text-base outline-none transition-[box-shadow,transform,background-color,border-color,color] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 data-loading:select-none data-loading:text-transparent active:not-disabled:scale-[0.98] sm:text-sm [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-10 px-[calc(--spacing(3.5)-1px)] sm:h-9",
        icon: "size-10 sm:size-9",
        "icon-lg": "size-11 sm:size-10",
        "icon-sm": "size-8 sm:size-7",
        "icon-xl":
          "size-11 sm:size-10 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        "icon-xs":
          "size-7 rounded-md before:rounded-[calc(var(--radius-md)-1px)] sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-[calc(--spacing(4)-1px)] sm:h-10",
        sm: "h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] sm:h-8",
        xl: "h-12 px-[calc(--spacing(5)-1px)] text-lg sm:h-11 sm:text-base [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        xs: "h-7 gap-1 rounded-md px-[calc(--spacing(2)-1px)] text-sm before:rounded-[calc(var(--radius-md)-1px)] sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        md: "h-10 px-[calc(--spacing(3.5)-1px)] sm:h-9",
      },
      variant: {
        default:
          "border-[#6650d8]/25 bg-gradient-to-b from-[#d9d1fe] via-[#c3b6fe] to-[#9a88fc] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:from-[#ebe7ff] hover:via-[#d9d1fe] hover:to-[#ae9dfd] data-pressed:from-[#c3b6fe] data-pressed:to-[#7e67f2] *:data-[slot=button-loading-indicator]:text-primary-foreground [:disabled,:active,[data-pressed]]:shadow-none",
        primary:
          "border-[#6650d8]/25 bg-gradient-to-b from-[#d9d1fe] via-[#c3b6fe] to-[#9a88fc] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:from-[#ebe7ff] hover:via-[#d9d1fe] hover:to-[#ae9dfd] data-pressed:from-[#c3b6fe] data-pressed:to-[#7e67f2] *:data-[slot=button-loading-indicator]:text-primary-foreground [:disabled,:active,[data-pressed]]:shadow-none",
        gradient:
          "border-[#5140a9]/35 bg-gradient-to-b from-[#c3b6fe] via-[#9a88fc] to-[#7e67f2] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_28px_-12px_rgba(154,136,252,0.88)] hover:from-[#d9d1fe] hover:via-[#ae9dfd] hover:to-[#9a88fc] data-pressed:from-[#ae9dfd] data-pressed:via-[#9a88fc] data-pressed:to-[#6650d8] *:data-[slot=button-loading-indicator]:text-primary-foreground [:disabled,:active,[data-pressed]]:shadow-none",
        destructive:
          "border-[#991b1b]/30 bg-destructive bg-gradient-to-b from-[#fca5a5] to-[#dc2626] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:from-[#fecaca] hover:to-[#ef4444] data-pressed:from-[#f87171] data-pressed:to-[#b91c1c] *:data-[slot=button-loading-indicator]:text-white [:disabled,:active,[data-pressed]]:shadow-none",
        "destructive-outline":
          "border-destructive/30 bg-gradient-to-b from-background to-destructive/10 text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:to-destructive/16 data-pressed:to-destructive/20 *:data-[slot=button-loading-indicator]:text-destructive-foreground [:disabled,:active,[data-pressed]]:shadow-none",
        ghost:
          "border-transparent text-foreground hover:bg-gradient-to-b hover:from-overlay/[0.02] hover:to-overlay/[0.07] data-pressed:bg-overlay/[0.08] *:data-[slot=button-loading-indicator]:text-foreground",
        link: "border-transparent text-foreground underline-offset-4 hover:underline data-pressed:underline *:data-[slot=button-loading-indicator]:text-foreground",
        outline:
          "border-overlay/[0.12] bg-gradient-to-b from-background to-overlay/[0.05] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] hover:to-overlay/[0.09] data-pressed:to-overlay/[0.12] *:data-[slot=button-loading-indicator]:text-foreground [:disabled,:active,[data-pressed]]:shadow-none",
        secondary:
          "border-primary/20 bg-gradient-to-b from-secondary to-[color-mix(in_oklab,var(--secondary),var(--primary)_16%)] text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:to-[color-mix(in_oklab,var(--secondary),var(--primary)_28%)] data-pressed:to-primary/25 *:data-[slot=button-loading-indicator]:text-secondary-foreground [:disabled,:active,[data-pressed]]:shadow-none",
      },
    },
  },
);

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export function resolvedButtonSize(
  size: ButtonSize | undefined,
  iconOnly: boolean | undefined,
): ButtonSize | undefined {
  if (!iconOnly) return size === "md" ? "default" : size;
  if (size === "sm" || size === "icon-sm" || size === "xs") return "icon-sm";
  if (size === "lg" || size === "xl" || size === "icon-lg") return "icon-lg";
  return "icon";
}

export function buttonClasses({
  variant = "secondary",
  size = "default",
  iconOnly = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
}): string {
  return cn(
    buttonVariants({
      variant,
      size: resolvedButtonSize(size, iconOnly),
      className,
    }),
  );
}
