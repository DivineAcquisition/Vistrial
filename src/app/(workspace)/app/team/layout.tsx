import type { ReactNode } from "react";

import { requireStaff } from "@/lib/auth/gates";

/** Vistrial staff only. Customers never reach these pages. The shell is the navigation. */
export default async function TeamLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return children;
}
