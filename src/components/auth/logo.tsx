"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Logo, LogoIcon, LogoText } from "@/components/ui/Logo";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

// Full logo with text
export function FullLogo({ className, size = "md" }: LogoProps) {
  return (
    <Link href="/" className={cn("block", className)}>
      <Logo size={size} variant="dark" />
    </Link>
  );
}

const iconSizeClasses = {
  sm: { size: "h-7 w-7", iconSize: "h-4 w-4" },
  md: { size: "h-9 w-9", iconSize: "h-5 w-5" },
  lg: { size: "h-12 w-12", iconSize: "h-6 w-6" },
};

// Icon only logo
export function IconLogo({ className, size = "md" }: LogoProps) {
  const sizeConfig = iconSizeClasses[size];

  return (
    <Link href="/" className={cn("block", className)}>
      <LogoIcon size={sizeConfig.size} iconSize={sizeConfig.iconSize} />
    </Link>
  );
}

// Logo mark without link
export function LogoMark({ className, size = "md" }: Omit<LogoProps, "className"> & { className?: string }) {
  const sizeConfig = iconSizeClasses[size];

  return (
    <div className={cn("inline-block", className)}>
      <LogoIcon size={sizeConfig.size} iconSize={sizeConfig.iconSize} />
    </div>
  );
}

// Re-export for backwards compatibility
export { Logo, LogoIcon, LogoText };
