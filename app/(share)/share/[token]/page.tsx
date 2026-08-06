import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { CostHero } from "@/components/portal/cost-hero";
import { Panel } from "@/components/ui/panel";
import { APP_NAME } from "@/lib/constants";
import {
  getShareLinkByHash,
  loadPortalDashboard,
  recordShareView,
} from "@/lib/db/portal";
import { formatDayLong, formatDateTime } from "@/lib/format";
import { hashToken } from "@/lib/portal/tokens";

export const metadata: Metadata = {
  title: `Shared dashboard — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await getShareLinkByHash(hashToken(token));
  if (!link || !link.client) notFound();

  if (Date.parse(link.expires_at) <= Date.now()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="panel max-w-md rounded-2xl px-7 py-8 text-center">
          <p className="text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
            {APP_NAME}
          </p>
          <h1 className="mt-4 text-xl font-semibold text-white">
            This link has expired
          </h1>
          <p className="mt-2 text-sm text-silver">
            Ask Divine Acquisition for a fresh share link.
          </p>
        </div>
      </main>
    );
  }

  const headerList = await headers();
  await recordShareView(link.id, headerList.get("user-agent"));

  const dashboard = await loadPortalDashboard(link.client_id);

  return (
    <main className="min-h-screen bg-background text-white">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-500 uppercase">
          {APP_NAME} · view only
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{link.client.name}</h1>
        <p className="mt-2 text-sm text-dim">
          Shared dashboard · expires {formatDateTime(link.expires_at)}. Nothing
          on this page can be changed.
        </p>

        <div className="mt-8">
          <CostHero cost={dashboard.cost} />
        </div>

        {dashboard.definition ? (
          <Panel className="mt-8 px-5 py-4">
            <p className="text-xs text-dim">
              Appointment definition · version {dashboard.definition.version} ·
              effective {formatDayLong(dashboard.definition.effective_from)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-silver">
              {dashboard.definition.criteria}
            </p>
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
