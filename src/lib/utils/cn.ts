// ============================================
// Classname utility using clsx and tailwind-merge
// ============================================

import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...args: ClassValue[]) {
  return twMerge(clsx(...args));
}
