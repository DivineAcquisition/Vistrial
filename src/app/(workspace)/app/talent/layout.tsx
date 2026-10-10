import type { ReactNode } from "react";

import { requireStaff } from "@/lib/auth/gates";

/** Vistrial staff only. Applicants are not a client workspace. */
export default async function TalentLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return children;
}
