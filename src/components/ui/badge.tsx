import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/cn"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-400 dark:ring-brand-400/20",
        secondary:
          "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/10 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20",
        success:
          "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
        warning:
          "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20",
        destructive:
          "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
        outline:
          "bg-transparent text-gray-700 ring-1 ring-inset ring-gray-200 dark:text-gray-300 dark:ring-gray-700",
        gradient:
          "bg-gradient-to-r from-brand-50 to-brand-100/80 text-brand-700 ring-1 ring-inset ring-brand-200/40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
