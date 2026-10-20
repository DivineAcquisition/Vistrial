import { redirect } from "next/navigation";

import { LegacyHome } from "@/app/(workspace)/app/home/legacy-home";
import { AgenticHomeSwitch } from "@/components/workspace/runtime";
import { AgenticWorkspace } from "@/components/workspace/workspace-page";
import { getAuthContext } from "@/lib/auth/session";
import { loadHomeState } from "@/lib/workspace/home-state";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tour?: string }> }) {
  const ctx = await getAuthContext();
  const home = await loadHomeState(ctx);
  const tour = (await searchParams).tour === "1";
  if (home.available && home.enabled) {
    if (ctx.workspaceRole === "operator") redirect("/app/today");
    return <AgenticWorkspace ctx={ctx} home={home} forceWelcome={tour} />;
  }
  return <LegacyHome ctx={ctx} footer={ctx.isStaff ? <AgenticHomeSwitch enabled={false} available={home.available} /> : null} />;
}
