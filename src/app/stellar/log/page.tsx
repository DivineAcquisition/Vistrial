import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { getStellarAuthContext } from "@/lib/stellar/auth";
import { stellarLandingPath } from "@/lib/stellar/navigation";

export const dynamic = "force-dynamic";

export default async function StellarLogPage() {
  const ctx = await getStellarAuthContext();
  if (ctx.kind !== "member" || ctx.member.role !== "setter") {
    redirect(stellarLandingPath(ctx));
  }

  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: ctx.member.orgTimezone,
  }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Setter&apos;s Log
        </p>
        <h1 className="mt-1 text-xl font-medium text-white">{today}</h1>
        <p className="mt-1 text-sm text-dim">{ctx.member.orgName}</p>
      </div>

      <Panel className="p-5">
        <h2 className="text-sm font-medium text-white">Log what happened</h2>
        <div className="mt-3">
          <EmptyState
            bare
            kind="unconfigured"
            title="Logging is not built yet"
            detail="The form for recording a shift's activity ships in Prompt S2. This is a placeholder for that form's shape, not a preview of its content."
          />
        </div>
      </Panel>

      <Panel className="p-5">
        <h2 className="text-sm font-medium text-white">End-of-day submission</h2>
        <div className="mt-3">
          <EmptyState
            bare
            kind="unconfigured"
            title="EOD submission is not built yet"
            detail="Submitting an end-of-day summary ships in Prompt S2. It is also what powers the DA console's days-since-last-EOD figure."
          />
        </div>
      </Panel>
    </div>
  );
}
