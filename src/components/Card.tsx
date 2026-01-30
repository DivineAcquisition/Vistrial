// Tremor Card [v0.0.2]

import React from "react"
import { Slot } from "@radix-ui/react-slot"

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
          "relative w-full rounded-xl text-left transition-all duration-200",
          // border
          "border",
          // variant styles
          variant === "default" && [
            "bg-white",
            "border-gray-200",
            "shadow-sm",
          ],
          variant === "glass" && [
            "bg-white/80 backdrop-blur-xl",
            "border-gray-200/60",
            "shadow-xl shadow-gray-200/40",
          ],
          // padding
          "p-6",
          className,
        )}
        tremor-id="tremor-raw"
        {...props}
      />
    )
  },
)

Card.displayName = "Card"

export { Card, type CardProps }
