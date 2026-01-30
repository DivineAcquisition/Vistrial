"use client"

import { cn } from "@/lib/utils/cn"

interface LogoIconProps {
  className?: string
  size?: number
}

// SVG Logo Icon (V shape)
export function LogoIcon({ className, size = 32 }: LogoIconProps) {
  return (
    <div 
      className={cn(
        "flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/25",
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="text-white"
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        <path
          d="M12 4L4 20h4l4-10 4 10h4L12 4z"
          fill="currentColor"
        />
      </svg>
    </div>
  )
}

interface LogoTextProps {
  className?: string
}

// Text logo "Vistrial"
export function LogoText({ className }: LogoTextProps) {
  return (
    <span className={cn("text-xl font-bold tracking-tight", className)}>
      Vistrial
    </span>
  )
}

interface LogoProps {
  className?: string
  showText?: boolean
  size?: "sm" | "md" | "lg"
  variant?: "light" | "dark"
}

// Full logo with icon and text
export function Logo({ className, showText = true, size = "md", variant = "dark" }: LogoProps) {
  const sizes = {
    sm: { icon: 28, gap: "gap-2" },
    md: { icon: 36, gap: "gap-2.5" },
    lg: { icon: 44, gap: "gap-3" },
  }

  const textColors = {
    light: "text-white",
    dark: "text-gray-900",
  }

  return (
    <div className={cn("flex items-center", sizes[size].gap, className)}>
      <LogoIcon size={sizes[size].icon} />
      {showText && (
        <div className="flex flex-col">
          <LogoText className={textColors[variant]} />
          <span className={cn("text-xs", variant === "light" ? "text-gray-400" : "text-gray-500")}>
            Quote Follow-Up
          </span>
        </div>
      )}
    </div>
  )
}

// Simple inline logo for headers
export function LogoInline({ className, variant = "dark" }: { className?: string; variant?: "light" | "dark" }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoIcon size={28} />
      <LogoText className={variant === "light" ? "text-white" : "text-gray-900"} />
    </div>
  )
}
