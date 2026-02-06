// ============================================
// LOGO COMPONENT
// Vistrial brand logo with brand colors
// ============================================

'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'dark' | 'light';
  className?: string;
  showText?: boolean;
}

const sizes = {
  sm: {
    icon: 'h-8 w-8',
    iconPx: 32,
    text: 'text-lg',
    image: { width: 120, height: 60 },
  },
  md: {
    icon: 'h-10 w-10',
    iconPx: 40,
    text: 'text-xl',
    image: { width: 150, height: 75 },
  },
  lg: {
    icon: 'h-12 w-12',
    iconPx: 48,
    text: 'text-2xl',
    image: { width: 180, height: 90 },
  },
  xl: {
    icon: 'h-16 w-16',
    iconPx: 64,
    text: 'text-3xl',
    image: { width: 240, height: 120 },
  },
};

// Logo icon component (just the icon)
export function LogoIcon({ 
  size = 'h-9 w-9', 
  iconSize = 'h-5 w-5',
  className 
}: { 
  size?: string; 
  iconSize?: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'relative flex items-center justify-center rounded-xl bg-brand-gradient shadow-lg shadow-brand-600/25',
      size,
      className
    )}>
      {/* Inner glow effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
      {/* V letter mark */}
      <svg 
        viewBox="0 0 24 24" 
        fill="none" 
        className={cn('relative text-white', iconSize)}
      >
        <path 
          d="M4 4L12 20L20 4" 
          stroke="currentColor" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// Logo text component
export function LogoText({ 
  className, 
  variant = 'dark' 
}: { 
  className?: string; 
  variant?: 'dark' | 'light';
}) {
  return (
    <span
      className={cn(
        'font-bold tracking-tight',
        variant === 'dark' ? 'text-gray-900' : 'text-white',
        className
      )}
    >
      Vistrial
    </span>
  );
}

// Full logo with image (uses VistrialLT.png)
export function LogoFull({ 
  size = 'md', 
  className,
  variant = 'dark'
}: LogoProps) {
  const sizeConfig = sizes[size];

  return (
    <div className={cn('flex items-center', className)}>
      <Image
        src="/VistrialLT.png"
        alt="Vistrial"
        width={sizeConfig.image.width}
        height={sizeConfig.image.height}
        className={cn(
          'object-contain',
          variant === 'light' && 'brightness-0 invert'
        )}
        priority
      />
    </div>
  );
}

// Default logo (icon + text)
export function Logo({ size = 'md', variant = 'dark', className, showText = true }: LogoProps) {
  const sizeConfig = sizes[size];

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoIcon size={sizeConfig.icon} iconSize={`h-${sizeConfig.iconPx / 8} w-${sizeConfig.iconPx / 8}`} />
      {showText && <LogoText className={sizeConfig.text} variant={variant} />}
    </div>
  );
}
