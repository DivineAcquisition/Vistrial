"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { LogoIcon, LogoText } from "@/components/ui/Logo";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const iconSizeClasses = {
  sm: { size: "h-7 w-7", iconSize: "h-4 w-4" },
  md: { size: "h-9 w-9", iconSize: "h-5 w-5" },
  lg: { size: "h-12 w-12", iconSize: "h-6 w-6" },
};

const imageSizes = {
  sm: { width: 100, height: 50, className: "h-7 w-auto" },
  md: { width: 140, height: 70, className: "h-9 w-auto" },
  lg: { width: 180, height: 90, className: "h-12 w-auto" },
};

// Full logo with image (uses VistrialLT.png)
export function FullLogo({ className, size = "md" }: LogoProps) {
  const imgSize = imageSizes[size];
  
  return (
    <Link href="/" className={cn("block", className)}>
      <Image
        src="/VistrialLT.png"
        alt="Vistrial"
        width={imgSize.width}
        height={imgSize.height}
        className={cn("object-contain", imgSize.className)}
        priority
      />
    </Link>
  );
}

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

// Combined logo with icon and text
export function Logo({ className, size = "md" }: LogoProps) {
  const sizeConfig = iconSizeClasses[size];
  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <LogoIcon size={sizeConfig.size} iconSize={sizeConfig.iconSize} />
      <LogoText className={textSizes[size]} variant="dark" />
    </Link>
  );
}

// Re-export for backwards compatibility
export { LogoIcon, LogoText };
