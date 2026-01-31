"use client"

import Image from "next/image"
import { cn } from "@/lib/utils/cn"

interface LogoIconProps {
  className?: string
  size?: number
}

// Logo Icon using VISTRIAL.png
export function LogoIcon({ className, size = 32 }: LogoIconProps) {
  return (
    <div 
      className={cn(
        "flex items-center justify-center",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/VISTRIAL.png"
        alt="Vistrial"
        width={size}
        height={size}
        className="object-contain"
        priority
      />
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
