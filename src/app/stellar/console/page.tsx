import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { getStellarAuthContext } from "@/lib/stellar/auth";
import { AGREEMENT_STATUS_LABELS, buildStageLabel } from "@/lib/stellar/build-stage";
import { stellarLandingPath } from "@/lib/stellar/navigation";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type PlacementListRow =
  Database["public"]["Functions"]["stellar_da_list_placements"]["Returns"][number];

async function listPlacements(): Promise<PlacementListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stellar_da_list_placements");
  if (error) return [];
  return data ?? [];
}

export default async function StellarConsolePage() {
  const ctx = await getStellarAuthContext();
  if (ctx.kind !== "da_operator") {
    redirect(stellarLandingPath(ctx));
  }

  const placements = await listPlacements();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          DA Console
        </p>
        <h1 className="mt-1 text-xl font-medium text-white">Active placements</h1>
        <p className="mt-1 text-sm text-dim">
          Every active Stellar placement. This read was logged to the DA access log.
        </p>
      </div>

      {placements.length === 0 ? (
        <EmptyState
          kind="empty"
          title="No active placements yet"
          detail="Active placements will list here once at least one client is placed."
        />
      ) : (
        <Panel className="overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Org</th>
                <th className="px-4 py-3 font-medium">Setter</th>
                <th className="px-4 py-3 font-medium">Agreement</th>
                <th className="px-4 py-3 font-medium">Build stage</th>
                <th className="px-4 py-3 font-medium">Days since last EOD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {placements.map((placement) => (
                <tr key={placement.placement_id}>
                  <td className="px-4 py-3 text-white">{placement.org_name}</td>
                  <td className="px-4 py-3 text-dim">{placement.setter_name ?? "Unassigned"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {AGREEMENT_STATUS_LABELS[placement.agreement_status] ?? placement.agreement_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-dim">{buildStageLabel(placement.build_stage)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Not available yet
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
