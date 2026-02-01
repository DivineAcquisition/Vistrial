"use client"

import Image from "next/image"
import { cn } from "@/lib/utils/cn"

interface LogoIconProps {
  className?: string
  size?: number
}

// Logo Icon using VISTRIAL.png (contains both icon and text)
export function LogoIcon({ className, size = 32 }: LogoIconProps) {
  return (
    <div 
      className={cn(
        "flex items-center justify-center",
        className
      )}
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

// Text logo "Vistrial" - kept for backwards compatibility but typically not needed
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
  size?: "sm" | "md" | "lg" | "xl"
  variant?: "light" | "dark"
}

// Full logo - PNG already contains icon + text, so this just displays the image
export function Logo({ className, size = "md" }: LogoProps) {
  // Sizes are now width-based since PNG is horizontal with text
  const sizes = {
    sm: { width: 100, height: 32 },
    md: { width: 140, height: 44 },
    lg: { width: 180, height: 56 },
    xl: { width: 220, height: 68 },
  }

  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/VISTRIAL.png"
        alt="Vistrial"
        width={sizes[size].width}
        height={sizes[size].height}
        className="object-contain"
        priority
      />
    </div>
  )
}

// Simple inline logo for headers - same as Logo since PNG has text
export function LogoInline({ className }: { className?: string; variant?: "light" | "dark" }) {
  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/VISTRIAL.png"
        alt="Vistrial"
        width={120}
        height={38}
        className="object-contain"
        priority
      />
    </div>
  )
}
