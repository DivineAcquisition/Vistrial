import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'relative bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 active:bg-brand-800 active:translate-y-[1px] before:absolute before:inset-[1px] before:rounded-[6px] before:border before:border-white/25 before:border-b-transparent before:pointer-events-none',
        destructive:
          'relative bg-red-600 text-white border border-red-700 hover:bg-red-700 active:bg-red-800 active:translate-y-[1px] before:absolute before:inset-[1px] before:rounded-[6px] before:border before:border-white/25 before:border-b-transparent before:pointer-events-none',
        outline:
          'relative bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 active:translate-y-[1px] before:absolute before:inset-[1px] before:rounded-[6px] before:border before:border-white before:border-b-transparent before:pointer-events-none',
        secondary:
          'relative bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 active:bg-gray-300 active:translate-y-[1px] before:absolute before:inset-[1px] before:rounded-[6px] before:border before:border-white/60 before:border-b-transparent before:pointer-events-none',
        ghost:
          'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200',
        link: 'text-brand-600 underline-offset-4 hover:underline hover:text-brand-700',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs before:rounded-[4px]',
        lg: 'h-11 rounded-lg px-6 text-base',
        xl: 'h-12 rounded-xl px-8 text-base before:rounded-[10px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
