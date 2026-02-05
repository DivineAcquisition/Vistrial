// ============================================
// LOGO COMPONENT
// Vistrial brand logo with brand colors
// ============================================

import { cn } from '@/lib/utils/cn';
import { Zap } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light';
  className?: string;
}

const sizes = {
  sm: {
    icon: 'h-8 w-8',
    iconInner: 'h-4 w-4',
    text: 'text-lg',
  },
  md: {
    icon: 'h-10 w-10',
    iconInner: 'h-5 w-5',
    text: 'text-xl',
  },
  lg: {
    icon: 'h-12 w-12',
    iconInner: 'h-6 w-6',
    text: 'text-2xl',
  },
};

function LogoIcon({ size = 'h-9 w-9', iconSize = 'h-5 w-5' }: { size?: string; iconSize?: string }) {
  return (
    <div className={cn('rounded-lg bg-brand-gradient flex items-center justify-center', size)}>
      <Zap className={cn('text-white', iconSize)} />
    </div>
  );
}

function LogoText({ className, variant = 'dark' }: { className?: string; variant?: 'dark' | 'light' }) {
  return (
    <span
      className={cn(
        'font-bold',
        variant === 'dark' ? 'text-gray-900' : 'text-white',
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
      <LogoIcon size={sizeConfig.icon} iconSize={sizeConfig.iconInner} />
      <LogoText className={sizeConfig.text} variant={variant} />
    </div>
  );
}

export { LogoIcon, LogoText };
