import Link from "next/link";

import { NoteBox } from "@/components/staff/result-button";
import { setCarrierStatus } from "@/app/(workspace)/app/team/staff-actions";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { formatRelative, orGap } from "@/lib/format";
import { loadConnections } from "@/lib/staff/load";
import type { ConnectionState } from "@/lib/staff/types";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connections" };

const TONE: Record<ConnectionState, "good" | "warning" | "critical" | "neutral"> = {
  ok: "good",
  degraded: "warning",
  failing: "critical",
  expired: "critical",
  not_set_up: "neutral",
};

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  const params = await searchParams;
  const all = params.all === "1";
  const rows = await loadConnections(ctx.isPlatformAdmin ? "all" : "mine");
  const shown = all ? rows : rows.filter((row) => row.state !== "ok");
  const now = new Date().toISOString();

  return (
    <PageFrame
      title="Connections"
      description="CRM, lead sources, messaging, carrier registration, email domain, chat, and event delivery. Secrets are never shown."
      actions={
        <Link href={all ? "/app/team/connections" : "/app/team/connections?all=1"} className="text-sm text-brand-300 underline">
          {all ? "Only problems" : "Show everything"}
        </Link>
      }
    >
      <ul className="grid gap-3">
        {shown.map((row) => (
          <li key={`${row.org_id}-${row.kind}-${row.label}`}>
            <Panel className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-strong">
                  {row.org_name} · {row.label}
                </span>
                <StatusBadge label={row.state.replaceAll("_", " ")} tone={TONE[row.state]} />
              </div>
              <p className={helperClass}>
                Last success {orGap(row.last_success_at, (value) => formatRelative(value, now))}
                {row.failing_since ? ` · failing since ${formatRelative(row.failing_since, now)}` : ""}
              </p>
              {row.last_error ? <p className="text-sm text-strong">{row.last_error}</p> : null}
              {row.kind === "carrier" ? (
                <div className="flex flex-wrap gap-2">
                  {(["not_registered", "pending", "approved", "rejected"] as const).map((status) => (
                    <NoteBox key={status} label={status.replaceAll("_", " ")} action={(note) => setCarrierStatus(row.org_id, status, note)} />
                  ))}
                </div>
              ) : null}
            </Panel>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p className={helperClass}>Nothing to show.</p> : null}
    </PageFrame>
  );
}
