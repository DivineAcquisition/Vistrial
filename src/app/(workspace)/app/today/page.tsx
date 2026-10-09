import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { getAuthContext } from "@/lib/auth/session";
import { loadExperiencePage } from "@/lib/cases/experience-load";
import { EMPTY_EXPERIENCE_FILTER, RESPONSE_LABEL } from "@/lib/cases/experience";
import { StatusBadge } from "@/components/ui/status-badge";
import { AgentRequestCard } from "@/components/live/request-card";
import { loadAgentRequests } from "@/lib/home/views";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const ctx = await getAuthContext();
  const mine = ctx.workspaceRole === "operator" ? "me" : null;
  const [attention, waiting, requests] = await Promise.all([
    loadExperiencePage({ ...EMPTY_EXPERIENCE_FILTER, view: "needs_attention", assignee: mine }),
    loadExperiencePage({ ...EMPTY_EXPERIENCE_FILTER, view: "waiting", assignee: mine }),
    loadAgentRequests(ctx),
  ]);
  const messages = requests.filter((item) => item.agentId === "relay");
  const rows = [...attention.rows, ...waiting.rows.filter((row) => !attention.rows.some((existing) => existing.id === row.id))].slice(0, 30);

  return (
    <PageFrame title="Today" description="What to do now, most urgent first.">
      {messages.length ? (
        <section aria-labelledby="today-messages" className="mb-6 space-y-3">
          <h2 id="today-messages" className="text-sm font-semibold">Messages to send from your CRM</h2>
          {messages.map((item) => (
            <AgentRequestCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting. New work shows up here as it becomes due.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/app/cases/${row.id}`} className="text-base font-medium hover:underline">{row.name}</Link>
                  <p className="text-sm text-muted-foreground">{row.nextStep ?? row.headline ?? "Open the case file"}</p>
                  <div className="mt-2">
                    <StatusBadge label={row.clockLabel ?? RESPONSE_LABEL[row.responseState]} tone={row.responseState === "missed" ? "critical" : row.responseState === "at_risk" ? "warning" : "neutral"} />
                  </div>
                  {row.clockReason ? <p className="mt-1 text-xs text-muted-foreground">Sentry: {row.clockReason}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.phone ? <a className="rounded-md border border-border px-3 py-2 text-sm" href={`tel:${row.phone}`}>Call</a> : null}
                  <Link className="rounded-md border border-border px-3 py-2 text-sm" href={`/app/cases/${row.id}`}>Open</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted-foreground">A daily summary to confirm will live here later. It is not built yet.</p>
    </PageFrame>
  );
}
