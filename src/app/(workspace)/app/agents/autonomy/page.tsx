import { PageFrame } from "@/components/app/page-frame";
import { AgentGlyph } from "@/components/live/agent-identity";
import { AGENTS } from "@/lib/agents/roster";
import { getAuthContext } from "@/lib/auth/session";
import { loadAutonomy } from "@/lib/workspace/load";
import { autonomyRows, gateModeWords, trustLine } from "@/lib/workspace/voice";

export const dynamic = "force-dynamic";

export const metadata = { title: "What your agents do on their own" };

/**
 * Read-only. Built from the workspace's real approval settings and Sentry
 * mode, so it cannot disagree with how the product behaves.
 */
export default async function AutonomyPage() {
  const ctx = await getAuthContext();
  const facts = await loadAutonomy(ctx);
  const rows = autonomyRows({ sentryMode: facts.sentryMode, agentTasks: facts.agentTasks });

  return (
    <PageFrame title="What your agents do on their own" description={trustLine(facts.trustAutoRun)}>
      <div className="flex flex-col gap-6">
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <li key={row.agentId} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <AgentGlyph agentId={row.agentId} size="md" />
                <div>
                  <h2 className="text-sm font-medium text-card-foreground">{AGENTS[row.agentId].name}</h2>
                  <p className="text-xs text-muted-foreground">{AGENTS[row.agentId].sublabel}</p>
                </div>
              </div>
              <List title="Does on its own" items={row.automatic} />
              <List title="Only suggests" items={row.suggests} />
              <List title="Never does without you" items={row.never} />
            </li>
          ))}
        </ul>

        <section aria-labelledby="autonomy-actions" className="flex flex-col gap-2">
          <h2 id="autonomy-actions" className="font-heading text-base text-card-foreground">
            Follow-up actions
          </h2>
          <p className="text-sm text-muted-foreground">How each action is set for this workspace right now.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {facts.gate.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm text-card-foreground">
                  {row.label}
                  {row.reachesPeople ? <span className="ms-2 text-xs text-muted-foreground">Reaches a lead</span> : null}
                </span>
                <span className="text-sm font-medium text-card-foreground">{gateModeWords(row.mode)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageFrame>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="mt-1 list-disc space-y-0.5 ps-4 text-sm text-card-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
