// Tremor Raw Input [v1.0.3]

import { RiEyeFill, RiEyeOffFill, RiSearchLine } from "@remixicon/react"
import React from "react"
import { tv, type VariantProps } from "tailwind-variants"

import { cx, focusInput, focusRing, hasErrorInput } from "@/lib/utils"

const inputStyles = tv({
  base: [
    // base
    "relative block w-full appearance-none truncate rounded-xl border px-4 py-3 outline-none transition-all duration-200 sm:text-sm",
    // border color
    "border-white/10",
    // text color
    "text-white",
    // placeholder color
    "placeholder-gray-500",
    // background color
    "bg-white/5",
    // hover
    "hover:bg-white/[0.07]",
    // focus
    "focus:bg-white/10 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20",
    // disabled
    "disabled:border-white/5 disabled:bg-white/[0.02] disabled:text-gray-600",
    // file
    [
      "file:-my-3 file:-ml-4 file:cursor-pointer file:rounded-l-xl file:rounded-r-none file:border-0 file:px-4 file:py-3 file:outline-none focus:outline-none disabled:pointer-events-none file:disabled:pointer-events-none",
      "file:border-solid file:border-white/10 file:bg-white/10 file:text-gray-300 file:hover:bg-white/20",
      "file:[border-inline-end-width:1px] file:[margin-inline-end:1rem]",
      "file:disabled:bg-white/5 file:disabled:text-gray-600",
    ],
    // remove search cancel button (optional)
    "[&::--webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
  ],
  variants: {
    hasError: {
      true: hasErrorInput,
    },
    // number input
    enableStepper: {
      false:
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    },
  },
})

interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputStyles> {
  inputClassName?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      inputClassName,
      hasError,
      enableStepper = true,
      type,
      ...props
    }: InputProps,
    forwardedRef,
  ) => {
    const [typeState, setTypeState] = React.useState(type)

    const isPassword = type === "password"
    const isSearch = type === "search"

    return (
      <div className={cx("relative w-full", className)}>
        <input
          ref={forwardedRef}
          type={isPassword ? typeState : type}
          className={cx(
            inputStyles({ hasError, enableStepper }),
            {
              "pl-8": isSearch,
              "pr-10": isPassword,
            },
            inputClassName,
          )}
          {...props}
        />
        {isSearch && (
          <div
            className={cx(
              // base
              "pointer-events-none absolute bottom-0 left-2 flex h-full items-center justify-center",
              // text color
              "text-gray-400 dark:text-gray-600",
            )}
          >
            <RiSearchLine
              className="size-[1.125rem] shrink-0"
              aria-hidden="true"
            />
          </div>
        )}
        {isPassword && (
          <div
            className={cx(
              "absolute bottom-0 right-0 flex h-full items-center justify-center px-3",
            )}
          >
            <button
              aria-label="Change password visibility"
              className={cx(
                // base
                "h-fit w-fit rounded-sm outline-none transition-all",
                // text
                "text-gray-400 dark:text-gray-600",
                // hover
                "hover:text-gray-500 hover:dark:text-gray-500",
                focusRing,
              )}
              type="button"
              onClick={() => {
                setTypeState(typeState === "password" ? "text" : "password")
              }}
            >
              <span className="sr-only">
                {typeState === "password" ? "Show password" : "Hide password"}
              </span>
              {typeState === "password" ? (
                <RiEyeFill aria-hidden="true" className="size-5 shrink-0" />
              ) : (
                <RiEyeOffFill aria-hidden="true" className="size-5 shrink-0" />
              )}
            </button>
          </div>
        )}
      </div>
    )
  },
)

Input.displayName = "Input"

export { Input, inputStyles, type InputProps }
