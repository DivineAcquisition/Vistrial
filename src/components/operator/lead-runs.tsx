import { listOperatorRunsForLeadAction } from "@/app/app/operator/actions";
import { OpenOperatorRunButton } from "@/components/operator/open-run-button";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";

export async function OperatorLeadRuns({ leadId }: { leadId: string }) {
  const runs = await listOperatorRunsForLeadAction(leadId);
  if (runs.length === 0) return null;

  return (
    <Panel className="mt-8 p-5">
      <SectionHeader
        title="Ask Vistrial"
        hint="Questions that mentioned this person. Opens the same record as History."
      />
      <ul className="space-y-2">
        {runs.map((run) => (
          <li key={run.id}>
            <OpenOperatorRunButton
              runId={run.id}
              requestText={run.requestText}
              status={run.status}
              createdAt={run.createdAt}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
