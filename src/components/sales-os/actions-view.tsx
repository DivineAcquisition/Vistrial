import { PolicyToggle, UndoButton } from "@/components/sales-os/action-controls";
import { EmptyLine, RecordSection } from "@/components/sales-os/record-section";
import { Badge } from "@/components/ui/badge";
import { executorFor } from "@/lib/actions/executors";
import { MCP_SERVERS } from "@/lib/actions/mcp";
import { ACTIONS, DEFAULT_INTERNAL_POLICY, TIER_LABEL, type InternalPolicy } from "@/lib/actions/registry";
import type { RunView } from "@/lib/actions/views";
import { connectorByKey } from "@/lib/connectors/catalog";
import { relativeTime } from "@/lib/sales-os/now";

const STATUS_LABEL: Record<string, string> = {
  suggested: "Waiting for a confirm",
  running: "Running",
  done: "Done",
  failed: "Did not run",
  dismissed: "Dismissed",
  undone: "Put back",
};

function appNames(keys: readonly string[]): string {
  return keys.map((key) => connectorByKey(key)?.name ?? MCP_SERVERS.find((server) => server.connector === key)?.label ?? key).join(", ");
}

/** The Actions page body: the three tiers, the Owner's settings, and recent changes. */
export function ActionsView({ policies, runs, owner, now }: { policies: Map<string, InternalPolicy>; runs: RunView[]; owner: boolean; now: number }) {
  const byTier = (tier: string) => ACTIONS.filter((action) => action.tier === tier);
  return (
    <div className="flex flex-col gap-4">
      <RecordSection id="tier-person" title={TIER_LABEL.reaches_person}>
        <p className="text-sm text-muted-foreground">
          Always drafted into Approvals. Consent, opt-outs, quiet hours (8 pm to 8 am), frequency limits and pauses are checked again when it sends. No setting
          changes this.
        </p>
        <ul className="divide-y divide-border">
          {byTier("reaches_person").map((action) => (
            <li key={action.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="text-sm">{action.label}</p>
                <p className="text-xs text-muted-foreground">{appNames(action.connectors)}</p>
              </div>
              <Badge variant={action.gateType ? "outline" : "warning"}>{action.gateType ? "Always approval" : "Not available yet"}</Badge>
            </li>
          ))}
        </ul>
      </RecordSection>

      <RecordSection id="tier-internal" title={TIER_LABEL.internal_write}>
        <p className="text-sm text-muted-foreground">
          Suggest means an agent proposes the change and a person confirms it. Do and log means it runs and shows up below with an undo where the app allows it.
          {owner ? "" : " Only an Owner can change these."}
        </p>
        <ul className="divide-y divide-border">
          {byTier("internal_write").map((action) => {
            const ready = action.connectors.some((key) => executorFor(action.name, key));
            return (
              <li key={action.name} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm">{action.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {appNames(action.connectors)}
                    {action.reversible ? " · Can be put back" : " · Cannot be put back"}
                    {ready ? "" : " · Coming soon"}
                  </p>
                </div>
                <div className="shrink-0">
                  <PolicyToggle action={action.name} label={action.label} mode={policies.get(action.name) ?? DEFAULT_INTERNAL_POLICY} disabled={!owner} />
                </div>
              </li>
            );
          })}
        </ul>
      </RecordSection>

      <RecordSection id="tier-read" title={TIER_LABEL.read}>
        <p className="text-sm text-muted-foreground">Runs within what the person asking can already see.</p>
        <ul className="divide-y divide-border">
          {byTier("read").map((action) => (
            <li key={action.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="text-sm">{action.label}</p>
                <p className="text-xs text-muted-foreground">{appNames(action.connectors)}</p>
              </div>
            </li>
          ))}
        </ul>
      </RecordSection>

      <RecordSection id="recent-runs" title="Recent changes">
        {runs.length === 0 ? (
          <EmptyLine>No changes yet.</EmptyLine>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm">
                    {run.label}
                    {run.leadName ? <span className="text-muted-foreground"> for {run.leadName}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {run.requestedBy} · {STATUS_LABEL[run.status] ?? run.status} · {relativeTime(run.createdAt, now)}
                  </p>
                </div>
                {run.status === "done" && run.reversible ? <UndoButton runId={run.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </RecordSection>
    </div>
  );
}
