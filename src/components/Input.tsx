// Tremor Input [v1.0.6]

import React from "react"
import { tv, type VariantProps } from "tailwind-variants"

import { cx, hasErrorInput } from "@/lib/utils"

const inputStyles = tv({
  base: [
    // base
    "relative block w-full appearance-none truncate rounded-xl border px-4 py-3 outline-none transition-all duration-200 sm:text-sm",
    // border
    "border-gray-200",
    // text
    "text-gray-900",
    "placeholder-gray-400",
    // background
    "bg-gray-50",
    // hover
    "hover:bg-white",
    // focus
    "focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
    // disabled
    "disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400",
    "disabled:placeholder:text-gray-300",
    // file
    [
      "file:-my-3 file:-ml-4 file:mr-4 file:cursor-pointer file:rounded-l-xl file:rounded-r-none",
      "file:border-0 file:border-r file:border-gray-200",
      "file:bg-gray-100 file:px-4 file:py-3 file:text-gray-700",
      "file:hover:bg-gray-200",
      "file:disabled:pointer-events-none file:disabled:bg-gray-200 file:disabled:text-gray-400",
    ],
    // invalid
    "aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-200",
  ],
  variants: {
    hasError: {
      true: hasErrorInput,
    },
  },
})

interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputStyles> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, type, ...props }: InputProps, forwardedRef) => {
    return (
      <input
        ref={forwardedRef}
        type={type}
        className={cx(inputStyles({ hasError }), className)}
        tremor-id="tremor-raw"
        {...props}
      />
    )
  },
)

Input.displayName = "Input"

export { Input, inputStyles, type InputProps }
