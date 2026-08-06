import { redirect } from "next/navigation";

import { getCurrentUser, homeForSession } from "@/lib/auth";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const home = await homeForSession();
  redirect(home === "/login" ? "/login?error=closed" : home);
}
