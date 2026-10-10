import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOwnerOrStaff } from "@/lib/auth/gates";
import { formatDayLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connections" };

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  stripe: "Payments",
  commas: "Payments",
  calendar: "Calendar",
  form_platform: "Forms",
};

const SOURCE_PURPOSE: Record<string, string> = {
  meta_ads: "Ad spend, for cost per booked call.",
  google_ads: "Ad spend, for cost per booked call.",
  stripe: "Sales, refunds, and chargebacks, for revenue.",
  commas: "Sales, refunds, and chargebacks, for revenue.",
  calendar: "Availability and booking times only.",
  form_platform: "New leads from your forms.",
};

function statusOf(status: string): { label: string; tone: "good" | "warning" | "neutral" } {
  if (status === "active") return { label: "Working", tone: "good" };
  if (status === "broken") return { label: "Needs reconnecting", tone: "warning" };
  return { label: "Off", tone: "neutral" };
}

/** What Vistrial reads from, and whether each link is working. Changes go through the Vistrial team. */
export default async function ConnectionsPage() {
  const ctx = await requireOwnerOrStaff();
  const db = await createClient();
  const [{ data: crm }, { data: sources }] = await Promise.all([
    db
      .from("ghl_connections")
      .select("id, location_name, status, last_verified_at, created_at")
      .eq("org_id", ctx.org.id)
      .order("created_at"),
    db
      .from("source_connections")
      .select("id, kind, status, account_label, last_verified_at")
      .eq("org_id", ctx.org.id)
      .order("created_at"),
  ]);

  return (
    <PageFrame
      title="Connections"
      description="Where Vistrial reads your leads and results from. Vistrial reads only. Nothing is written back to your CRM."
    >
      <Panel className="p-6">
        <h2 className={cardTitle}>CRM</h2>
        {crm?.length ? (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {crm.map((row) => {
              const status = statusOf(row.status);
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-white">{row.location_name ?? "Your CRM"}</span>
                    <span className={helperClass}>
                      {row.last_verified_at ? `Last checked ${formatDayLong(row.last_verified_at)}` : "Not checked yet"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge label={status.label} tone={status.tone} />
                    {row.status === "broken" ? (
                      <Link
                        href="/app/onboarding/connect"
                        className="text-sm font-medium text-brand-300 underline-offset-4 hover:underline"
                      >
                        Reconnect
                      </Link>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`${helperClass} mt-2`}>
            No CRM is connected yet.{" "}
            <Link href="/app/onboarding/connect" className="font-medium text-brand-300 underline-offset-4 hover:underline">
              Connect your CRM
            </Link>
          </p>
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Other sources</h2>
        {sources?.length ? (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {sources.map((row) => {
              const status = statusOf(row.status);
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-white">
                      {SOURCE_LABELS[row.kind] ?? row.kind}
                      {row.account_label ? ` · ${row.account_label}` : ""}
                    </span>
                    <span className={helperClass}>{SOURCE_PURPOSE[row.kind] ?? ""}</span>
                  </span>
                  <StatusBadge label={status.label} tone={status.tone} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`${helperClass} mt-2`}>
            None yet. Ad accounts, payments, and calendars are optional and add cost per call and revenue to Results.
          </p>
        )}
      </Panel>

      <p className={helperClass}>
        Want to add or change a connection?{" "}
        {ctx.isStaff ? (
          <Link href="/app/settings/integrations" className="font-medium text-brand-300 underline-offset-4 hover:underline">
            Manage integrations
          </Link>
        ) : (
          <Link
            href="/app/help?topic=connections"
            className="font-medium text-brand-300 underline-offset-4 hover:underline"
          >
            Ask your Vistrial team
          </Link>
        )}
      </p>
    </PageFrame>
  );
}
