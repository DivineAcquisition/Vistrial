import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { getStellarAuthContext } from "@/lib/stellar/auth";
import { buildStageIndex, buildStageLabel, BUILD_STAGE_ORDER } from "@/lib/stellar/build-stage";
import { stellarLandingPath } from "@/lib/stellar/navigation";
import type { Tables } from "@/types/database";

export const dynamic = "force-dynamic";

type PlacementRow = Pick<Tables<"placements">, "build_stage" | "build_stage_updated_at">;

async function activePlacement(orgId: string): Promise<PlacementRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("placements")
    .select("build_stage, build_stage_updated_at")
    .eq("org_id", orgId)
    .is("ended_at", null)
    .maybeSingle();
  return data ?? null;
}

function BuildProgress({ placement }: { placement: PlacementRow | null }) {
  if (!placement) {
    return (
      <EmptyState
        bare
        kind="empty"
        title="No active placement on file"
        detail="Build progress will appear here once a placement is set up for this workspace."
      />
    );
  }

  const currentIndex = buildStageIndex(placement.build_stage);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {BUILD_STAGE_ORDER.map((stage, index) => {
          const isCurrent = index === currentIndex;
          const isDone = index < currentIndex;
          return (
            <li
              key={stage}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                isCurrent
                  ? "border-brand-400/40 bg-brand-400/10 text-white"
                  : isDone
                    ? "border-transparent text-dim"
                    : "border-transparent text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  isCurrent
                    ? "bg-brand-400 text-black"
                    : isDone
                      ? "bg-white/20 text-white"
                      : "bg-white/[0.06] text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>
              <span>{buildStageLabel(stage)}</span>
              {isCurrent ? (
                <Badge variant="secondary" className="ml-auto">
                  Current
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">
        Last updated {new Date(placement.build_stage_updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}

export default async function StellarPortalPage() {
  const ctx = await getStellarAuthContext();
  if (ctx.kind !== "member" || ctx.member.role !== "client_viewer") {
    redirect(stellarLandingPath(ctx));
  }

  const placement = await activePlacement(ctx.member.orgId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Client Portal
        </p>
        <h1 className="mt-1 text-xl font-medium text-white">{ctx.member.orgName}</h1>
      </div>

      <Panel className="p-5">
        <h2 className="text-sm font-medium text-white">Agreement</h2>
        <div className="mt-3">
          <EmptyState
            bare
            kind="unconfigured"
            title="Your agreement is not connected yet"
            detail="Agreement status and documents will appear here once that connection ships (Prompt S3)."
          />
        </div>
      </Panel>

      <Panel className="p-5">
        <h2 className="text-sm font-medium text-white">Payment</h2>
        <div className="mt-3">
          <EmptyState
            bare
            kind="unconfigured"
            title="Payment is not connected yet"
            detail="Billing history and upcoming charges will appear here once that connection ships (Prompt S3)."
          />
        </div>
      </Panel>

      <Panel className="p-5">
        <h2 className="text-sm font-medium text-white">Build Progress</h2>
        <div className="mt-3">
          <BuildProgress placement={placement} />
        </div>
      </Panel>

      <Panel className="p-5">
        <h2 className="text-sm font-medium text-white">Results</h2>
        <div className="mt-3">
          <EmptyState
            bare
            kind="unconfigured"
            title="Your results are not connected yet"
            detail="Outcomes and performance figures will appear here once that connection ships (Prompt S3)."
          />
        </div>
      </Panel>
    </div>
  );
}
