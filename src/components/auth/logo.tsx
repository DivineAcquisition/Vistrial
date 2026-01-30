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

// Icon only logo
export function IconLogo({ className, size = "md" }: LogoProps) {
  const sizes = {
    sm: 28,
    md: 36,
    lg: 48,
  };

  return (
    <Link href="/" className={cn("block", className)}>
      <LogoIcon size={sizes[size]} />
    </Link>
  );
}

// Logo mark without link
export function LogoMark({ className, size = "md" }: Omit<LogoProps, "className"> & { className?: string }) {
  const sizes = {
    sm: 28,
    md: 36,
    lg: 48,
  };

  return (
    <div className={cn("inline-block", className)}>
      <LogoIcon size={sizes[size]} />
    </div>
  );
}

// Re-export for backwards compatibility
export { Logo, LogoIcon, LogoText };
