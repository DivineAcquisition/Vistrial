import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { CostHero } from "@/components/portal/cost-hero";
import { Backdrop } from "@/components/ui/backdrop";
import { Panel } from "@/components/ui/panel";
import { APP_NAME } from "@/lib/constants";
import { eyebrow } from "@/lib/ui";
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
      <AuthCard title="This link has expired">
        <p className="text-center text-sm text-silver">
          Ask Divine Acquisition for a fresh share link.
        </p>
      </AuthCard>
    );
  }

  const headerList = await headers();
  await recordShareView(link.id, headerList.get("user-agent"));

  const dashboard = await loadPortalDashboard(link.client_id);

  return (
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
      <Backdrop />

      <main className="relative z-10 mx-auto max-w-5xl px-5 py-12 sm:px-6">
        <p className={eyebrow}>{APP_NAME} · view only</p>
        <h1 className="animate-rise delay-1 mt-5 text-2xl font-semibold sm:text-3xl">
          {link.client.name}
        </h1>
        <p className="animate-rise delay-2 mt-2 text-sm text-silver">
          Shared dashboard · expires {formatDateTime(link.expires_at)}. Nothing
          on this page can be changed.
        </p>

        <div className="animate-rise delay-3 mt-8">
          <CostHero cost={dashboard.cost} />
        </div>

        {dashboard.definition ? (
          <Panel className="animate-rise delay-4 mt-8 px-5 py-4">
            <p className="text-xs text-dim">
              Appointment definition · version {dashboard.definition.version} ·
              effective {formatDayLong(dashboard.definition.effective_from)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-silver">
              {dashboard.definition.criteria}
            </p>
          </Panel>
        ) : null}
      </main>
    </div>
  );
}
