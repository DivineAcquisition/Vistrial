'use client';

import { cn } from '@/lib/utils/cn';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
  className?: string;
}

const sizes = {
  sm: { icon: 24, text: 'text-lg' },
  md: { icon: 32, text: 'text-xl' },
  lg: { icon: 40, text: 'text-2xl' },
};

export function LogoIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="8" fill="url(#gradient)" />
      <path
        d="M12 28L20 12L28 28H12Z"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="20" cy="22" r="3" fill="white" />
      <defs>
        <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LogoText({
  className,
  variant = 'dark',
}: {
  className?: string;
  variant?: 'light' | 'dark';
}) {
  return (
    <span
      className={cn(
        'font-bold tracking-tight',
        variant === 'dark' ? 'text-white' : 'text-gray-900',
        className
      )}
    >
      Vistrial
    </span>
  );
}

export function Logo({ size = 'md', variant = 'dark', className }: LogoProps) {
  const sizeConfig = sizes[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LogoIcon size={sizeConfig.icon} />
      <LogoText className={sizeConfig.text} variant={variant} />
    </div>
  );
}
