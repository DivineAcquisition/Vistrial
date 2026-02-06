import * as React from "react"

import { cn } from "@/lib/utils/cn"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors duration-200",
          "placeholder:text-gray-400",
          "hover:border-gray-400",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60",
          "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500",
          "dark:hover:border-gray-600 dark:focus:border-brand-500 dark:focus:ring-brand-500/20",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
