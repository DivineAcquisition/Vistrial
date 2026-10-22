import Link from "next/link";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ActivitySection, ActivitySkeleton, QueueSection, QueueSkeleton } from "@/app/(workspace)/app/home/sections";
import { PageFrame } from "@/components/app/page-frame";
import { CommandView } from "@/components/sales-os/command-view";
import { SalesOsSwitch } from "@/components/sales-os/flag-switch";
import { LeadHeader, NowPanel } from "@/components/sales-os/lead-summary";
import { RecordSection } from "@/components/sales-os/record-section";
import { isLeadId } from "@/lib/cases/filters";
import { loadCommand } from "@/lib/sales-os/command";
import { isTeamManager } from "@/lib/sales-os/flag";
import { requireSalesOs } from "@/lib/sales-os/guard";
import { loadLeadRecord } from "@/lib/sales-os/lead-record";
import { requestNow } from "@/lib/sales-os/now";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Command" };

export default async function CommandPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const ctx = await requireSalesOs();
  const { lead } = await searchParams;
  const db = (await createClient()) as unknown as SupabaseClient;
  const leads = ctx.workspaceRole !== "member" || ctx.isStaff;
  const manager = await isTeamManager(ctx.org.id);
  const now = requestNow();
  const [data, record] = await Promise.all([
    loadCommand(db, { orgId: ctx.org.id, memberId: ctx.member.id, timeZone: ctx.org.timezone, leads, manager, now }),
    leads && lead && isLeadId(lead) ? loadLeadRecord(lead, { orgId: ctx.org.id, userId: ctx.user.id }) : Promise.resolve(null),
  ]);
  const foundationOpen = data.foundation.version === null || data.foundation.confirmed < data.foundation.total;

  return (
    <PageFrame title="Command" description="What needs you now, across your leads, playbooks and team.">
      <CommandView
        data={data}
        now={now}
        showFoundation={foundationOpen && (ctx.workspaceRole === "owner" || ctx.isStaff)}
        leads={leads}
        manager={manager}
        queue={
          <Suspense fallback={<QueueSkeleton />}>
            <QueueSection ctx={ctx} />
          </Suspense>
        }
        activity={
          <Suspense fallback={<ActivitySkeleton />}>
            <ActivitySection ctx={ctx} />
          </Suspense>
        }
        lead={
          record ? (
            <>
              <RecordSection
                id="command-lead"
                title="Lead"
                action={
                  <Link href="/app/command" scroll={false} className="text-sm underline-offset-4 hover:underline">
                    Close
                  </Link>
                }
              >
                <LeadHeader payload={record.payload} now={now} compact />
              </RecordSection>
              <RecordSection id="command-lead-now" title="Now" owner="Compass">
                <NowPanel summary={record.now} />
              </RecordSection>
            </>
          ) : null
        }
      />
      {ctx.isStaff ? <SalesOsSwitch enabled /> : null}
    </PageFrame>
  );
}
