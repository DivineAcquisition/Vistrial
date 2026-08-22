"use client";

import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * A panel that slides in over the page.
 *
 * For reading or editing one thing in detail without losing the list behind it.
 * A drawer keeps the operator's place; a route change does not. Focus is
 * trapped and Escape closes it, which comes from the underlying sheet.
 */
export function Drawer({
  trigger,
  title,
  description,
  footer,
  side = "right",
  width = "md",
  open,
  onOpenChange,
  children,
}: {
  trigger?: ReactNode;
  title: string;
  description?: string;
  footer?: ReactNode;
  side?: "right" | "left";
  width?: "md" | "lg";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        side={side}
        className={cn(
          "flex w-full flex-col bg-ink-900 p-0 text-white",
          width === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        <SheetHeader className="border-b border-white/[0.07] p-6">
          <SheetTitle className="text-base font-semibold text-white">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-sm leading-relaxed text-silver">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] p-6">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
