import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { icon: 32, full: { width: 120, height: 32 } },
  md: { icon: 40, full: { width: 150, height: 40 } },
  lg: { icon: 56, full: { width: 200, height: 56 } },
};

// Full logo with text (VISTRIAL.png)
export function Logo({ className, size = "md" }: LogoProps) {
  const { full } = sizes[size];

  return (
    <Link href="/" className={cn("block", className)}>
      <Image
        src="/VISTRIAL.png"
        alt="Vistrial"
        width={full.width}
        height={full.height}
        className="h-auto w-auto"
        priority
      />
    </Link>
  );
}

// Icon only logo (Untitled design (2).png)
export function LogoIcon({ className, size = "md" }: Omit<LogoProps, "showText">) {
  const { icon } = sizes[size];

  return (
    <Link href="/" className={cn("block", className)}>
      <Image
        src="/Untitled design (2).png"
        alt="Vistrial"
        width={icon}
        height={icon}
        className="h-auto w-auto"
        priority
      />
    </Link>
  );
}

// Flexible logo - icon or full based on prop
export function LogoBrand({ 
  className, 
  size = "md", 
  variant = "full" 
}: LogoProps & { variant?: "full" | "icon" }) {
  if (variant === "icon") {
    return <LogoIcon className={className} size={size} />;
  }
  return <Logo className={className} size={size} />;
}
