"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Replays the page enter motion when the in-app route changes.
 * CSS-only so it respects `prefers-reduced-motion` from globals.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="app-enter">
      {children}
    </div>
  );
}
