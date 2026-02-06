import * as React from "react"

import { cn } from "@/lib/utils/cn"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors duration-200",
          "placeholder:text-gray-400",
          "hover:border-gray-400",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:opacity-60",
          "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500",
          "dark:hover:border-gray-600 dark:focus:border-brand-500 dark:focus:ring-brand-500/20",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
