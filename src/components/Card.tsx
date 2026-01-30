// Tremor Raw Card [v0.0.1]

import { Slot } from "@radix-ui/react-slot"
import React from "react"

import { cx } from "@/lib/utils"

interface CardProps extends React.ComponentPropsWithoutRef<"div"> {
  asChild?: boolean
  variant?: "default" | "glass"
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asChild, variant = "default", ...props }, forwardedRef) => {
    const Component = asChild ? Slot : "div"
    return (
      <Component
        ref={forwardedRef}
        className={cx(
          // base
          "relative w-full rounded-2xl border p-6 text-left",
          // default variant (dark glassmorphism)
          variant === "default" && [
            "bg-gray-900/80 backdrop-blur-xl",
            "border-white/10",
          ],
          // glass variant with glow
          variant === "glass" && [
            "bg-gray-900/80 backdrop-blur-xl",
            "border-white/10",
            "shadow-lg shadow-brand-500/5",
          ],
          className,
        )}
        {...props}
      />
    )
  },
)

Card.displayName = "Card"

export { Card, type CardProps }
