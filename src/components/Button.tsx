// Tremor Button [v0.2.2]

import React from "react"
import { Slot } from "@radix-ui/react-slot"
import { RiLoader2Fill } from "@remixicon/react"
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
        // base
        "border-transparent",
        "text-white",
        "bg-gradient-to-r from-brand-500 to-brand-600",
        // hover
        "hover:from-brand-600 hover:to-brand-700",
        // shadow & scale
        "shadow-lg shadow-brand-500/25",
        "hover:shadow-xl hover:shadow-brand-500/30",
        "hover:scale-[1.02] active:scale-[0.98]",
      ],
      secondary: [
        // base
        "border-gray-200",
        "text-gray-700",
        "bg-white",
        // hover
        "hover:bg-gray-50 hover:text-gray-900",
        "hover:border-gray-300",
      ],
      light: [
        // base
        "border-gray-200",
        "text-gray-900",
        "bg-white",
        // hover
        "hover:bg-gray-50",
      ],
      ghost: [
        // base
        "border-transparent",
        "text-gray-700",
        "bg-transparent",
        // hover
        "hover:bg-gray-100",
        "hover:text-gray-900",
      ],
      destructive: [
        // base
        "border-transparent",
        "text-white",
        "bg-red-600",
        // hover
        "hover:bg-red-700",
        // shadow
        "shadow-lg shadow-red-500/25",
      ],
    },
    size: {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base",
      xl: "h-14 px-8 text-lg",
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
        tremor-id="tremor-raw"
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
