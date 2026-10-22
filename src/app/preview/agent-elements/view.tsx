"use client";

import { useState } from "react";

import { AgentComposer } from "@/components/agent-elements/composer";
import { AgentError, FieldChangeList, PlanCard, QuestionChoices, ToolGroupCard } from "@/components/agent-elements/cards";
import type { AgentIntent } from "@/lib/agent-elements/intent";

export function AgentElementsPreview() {
  const [intent, setIntent] = useState<AgentIntent>("lookup");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [approved, setApproved] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <main className="min-h-svh bg-background px-4 py-8 text-card-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="font-heading text-2xl tracking-tight">Agent cards</h1>
        <AgentComposer
          value={value}
          onChange={setValue}
          intent={intent}
          onIntentChange={setIntent}
          pending={pending}
          contextLabel="Northstar lead"
          placeholder="Ask about this lead"
          suggestions={[
            { label: "What should we do next?", value: "What should we do next?" },
            { label: "Draft a follow-up", value: "Draft a follow-up from the last call." },
          ]}
          onStop={() => setPending(false)}
          onSend={(text) => {
            setSent(text);
            setValue("");
            setApproved(null);
            setFailed(false);
            setPending(true);
            window.setTimeout(() => setPending(false), 600);
          }}
        />
        {sent ? (
          <div className="flex flex-col gap-3">
            <p className="ms-auto max-w-[80%] rounded-2xl bg-brand-500/10 px-4 py-2 text-sm">{sent}</p>
            <ToolGroupCard
              label={pending ? "Opening the case file" : "Checked 2 things"}
              pending={pending}
              steps={[
                { id: "1", title: "Opened the case file", detail: pending ? null : "Score 82, one open objection.", state: pending ? "running" : "done" },
                {
                  id: "2",
                  title: "Read the last call",
                  state: pending ? "running" : "done",
                  links: [{ id: "lead", href: "/preview/agent-elements", name: "Northstar lead", meta: "ready" }],
                },
              ]}
            />
            {!pending && intent === "propose" ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="mb-2 text-sm font-medium">Assign · 1 record</p>
                <FieldChangeList rows={[{ field: "Owner", before: "Unassigned", after: "Jordan" }]} />
              </div>
            ) : null}
            {!pending ? (
              <PlanCard
                title={intent === "draft" ? "Draft is ready" : "Suggested. Nothing happens until you confirm."}
                body={intent === "draft" ? "A follow-up is ready for approval. Nothing is sent from here." : "Assign Northstar lead to Jordan."}
                approveLabel={intent === "lookup" ? "Open the case file" : "Approve"}
                onApprove={() => setApproved(intent === "lookup" ? "Opened." : "Approved. Nothing was sent.")}
                onDecline={() => setApproved("Left unchanged.")}
                doneMessage={approved}
              />
            ) : null}
            <QuestionChoices
              prompt="Two people are named Jordan. Which one?"
              options={[
                { id: "a", label: "Jordan Lee, setter" },
                { id: "b", label: "Jordan Patel, closer" },
              ]}
              value={answer}
              onChange={setAnswer}
            />
            <button type="button" className="self-start text-sm text-brand-300 underline" onClick={() => setFailed((current) => !current)}>
              {failed ? "Hide the problem" : "Show a problem"}
            </button>
            {failed ? <AgentError message="That could not finish. Nothing was changed." onRetry={() => setFailed(false)} /> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Send a message to see the cards a person gets back.</p>
        )}
      </div>
    </main>
  );
}
