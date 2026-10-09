"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runSimulatorAction, setTestWorkspaceAction } from "@/app/(workspace)/app/agents/actions";
import { useAgentPanel } from "@/components/live/agent-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AGENT_LIST, type LiveAgentId } from "@/lib/agents/roster";

export function SimulatorControls({
  workspaceName,
  isTest,
  scenarios,
}: {
  workspaceName: string;
  isTest: boolean;
  scenarios: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const panel = useAgentPanel();
  const [agentId, setAgentId] = useState<LiveAgentId | "">("");
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (scenario: string) => {
    setRunning(scenario);
    setMessage(null);
    const result = await runSimulatorAction(scenario, agentId || undefined);
    setRunning(null);
    setMessage(result.ok ? "Started. Watch the strip under the header, or open the agent panel." : result.error);
  };

  const toggle = async (on: boolean) => {
    const result = await setTestWorkspaceAction(on);
    if (!result.ok) setMessage(result.error);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {isTest ? (
        <Alert variant="warning">
          <AlertTitle>{workspaceName} is a test workspace</AlertTitle>
          <AlertDescription>Simulated runs appear here and are labelled as simulations everywhere they show.</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>The simulator is off in {workspaceName}</AlertTitle>
          <AlertDescription>
            It only runs in a workspace marked for testing. Switch to the test workspace, or mark this one if it holds no real
            customers.
          </AlertDescription>
        </Alert>
      )}

      {isTest ? (
        <Card className="gap-4 p-5">
          <label className="block max-w-xs text-sm text-muted-foreground">
            Agent (optional)
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value as LiveAgentId | "")}
              className="mt-1 block h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-card-foreground"
            >
              <option value="">The scenario&apos;s usual agent</option>
              {AGENT_LIST.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {scenarios.map((scenario) => (
              <Button
                key={scenario.id}
                variant="outline"
                className="justify-start"
                loading={running === scenario.id}
                disabled={running !== null}
                onClick={() => void run(scenario.id)}
              >
                {scenario.label}
              </Button>
            ))}
          </div>
          {message ? (
            <p role="status" className="text-sm text-muted-foreground">
              {message}{" "}
              <button type="button" className="font-medium text-brand-300 hover:underline" onClick={panel.open}>
                Open the agent panel
              </button>
            </p>
          ) : null}
        </Card>
      ) : null}

      <div>
        {isTest ? (
          <ConfirmDialog
            trigger={<Button variant="ghost">Stop treating this as a test workspace</Button>}
            title="Turn off testing here?"
            description="The simulator stops working in this workspace. Simulated runs already made stay labelled."
            confirmLabel="Turn off testing"
            onConfirm={() => toggle(false)}
          />
        ) : (
          <ConfirmDialog
            trigger={<Button variant="outline">Mark {workspaceName} as a test workspace</Button>}
            title={`Mark ${workspaceName} for testing?`}
            description="Only do this for a workspace with no real customers. Anyone in it will see simulated agent activity, labelled as such."
            confirmLabel="Mark for testing"
            onConfirm={() => toggle(true)}
          />
        )}
      </div>
    </div>
  );
}
