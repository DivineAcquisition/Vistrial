import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 ease-spring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'relative bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-brand-600 hover:to-brand-700 hover:shadow-[0_4px_12px_rgba(83,71,209,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]',
        destructive:
          'relative bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-red-600 hover:to-red-700 hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)]',
        outline:
          'relative bg-white text-gray-700 border border-gray-200 shadow-xs hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 hover:shadow-soft',
        secondary:
          'relative bg-gray-100 text-gray-700 border border-gray-200/60 hover:bg-gray-150 hover:text-gray-900 hover:border-gray-300/60',
        ghost:
          'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        link: 'text-brand-600 underline-offset-4 hover:underline hover:text-brand-700',
        gradient:
          'relative text-white shadow-[0_2px_8px_rgba(83,71,209,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_8px_24px_rgba(83,71,209,0.4)] bg-[length:200%_auto] bg-brand-gradient-vibrant hover:bg-right',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-6 text-sm',
        xl: 'h-12 rounded-xl px-8 text-base',
        icon: 'h-10 w-10 rounded-xl',
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
