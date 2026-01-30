// Tremor Raw Button [v0.1.1]

import { Slot } from "@radix-ui/react-slot"
import { RiLoader2Fill } from "@remixicon/react"
import React from "react"
import { tv, type VariantProps } from "tailwind-variants"

import { cx, focusRing } from "@/lib/utils"

const buttonVariants = tv({
  base: [
    // base
    "relative inline-flex items-center justify-center whitespace-nowrap rounded-xl border text-center font-medium transition-all duration-200 ease-in-out",
    // disabled
    "disabled:pointer-events-none disabled:opacity-50",
    // focus
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        // border
        "border-transparent",
        // text color
        "text-white",
        // background color
        "bg-gradient-to-r from-brand-500 to-brand-600",
        // hover color
        "hover:from-brand-400 hover:to-brand-500",
        // shadow
        "shadow-lg shadow-brand-500/25",
        // hover scale
        "hover:scale-[1.02] active:scale-[0.98]",
      ],
      secondary: [
        // border
        "border-white/10",
        // text color
        "text-gray-300",
        // background color
        "bg-white/5",
        //hover color
        "hover:bg-white/10 hover:text-white",
        // hover border
        "hover:border-white/20",
      ],
      light: [
        // base
        "shadow-none",
        // border
        "border-transparent",
        // text color
        "text-white",
        // background color
        "bg-white/10",
        // hover color
        "hover:bg-white/20",
      ],
      ghost: [
        // base
        "shadow-none",
        // border
        "border-transparent",
        // text color
        "text-gray-400",
        // hover color
        "bg-transparent hover:bg-white/5 hover:text-white",
      ],
      destructive: [
        // text color
        "text-white",
        // border
        "border-transparent",
        // background color
        "bg-red-600",
        // hover color
        "hover:bg-red-500",
        // shadow
        "shadow-lg shadow-red-500/25",
      ],
    },
    size: {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-5 py-2.5 text-sm",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
})

interface ButtonProps
  extends React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild,
      isLoading = false,
      loadingText,
      className,
      disabled,
      variant,
      size,
      children,
      ...props
    }: ButtonProps,
    forwardedRef,
  ) => {
    const Component = asChild ? Slot : "button"
    return (
      <Component
        ref={forwardedRef}
        className={cx(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <RiLoader2Fill
              className="size-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">
              {loadingText ? loadingText : "Loading"}
            </span>
            {loadingText ? loadingText : children}
          </span>
        ) : (
          children
        )}
      </Component>
    )
  },
)

Button.displayName = "Button"

export { Button, buttonVariants, type ButtonProps }
