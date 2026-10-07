import type { ReactNode } from "react";

import { TeamNav } from "@/app/app/team/team-nav";
import { requireStaff } from "@/lib/auth/gates";

/** Vistrial staff only. Customers are sent back to their own app. */
export default async function TeamLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return (
    <>
      <TeamNav />
      {children}
    </>
  );
}
