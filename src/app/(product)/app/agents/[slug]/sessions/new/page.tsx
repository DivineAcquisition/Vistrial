"use client";

import { Lightbulb, Sparkles } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AssignmentForm } from "@/components/research/assignment-form";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Panel } from "@/components/ui/panel";

const SUGGESTIONS = [
  "Which offers and messages do my local competitors lead with, and where can we stand out?",
  "What do competitors' video ads promise in the first three seconds?",
  "Who shows prices on their site, and how do they frame them?",
];

function NewSession() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  const objective = query.get("objective") ?? "";
  const canStart = shell.role !== "rep" && agent?.state !== "off";
  if (params.slug !== "growth-architect") {
    return (
      <Panel className="p-5">
        <p className="text-sm text-muted-foreground">{agent?.name ?? "This agent"} does not run sessions yet.</p>
      </Panel>
    );
  }
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
          <Sparkles aria-hidden className="size-4" />
        </span>
        <div className="grid gap-3">
          <p className="text-sm text-card-foreground">
            <span className="font-medium">{agent?.name}</span>{" "}
            <span className="text-muted-foreground">
              What should I find out? I&apos;ll read what I already know about your business, write a plan with a budget, and ask you only if an answer would change the result.
            </span>
          </p>
          {!objective ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((line) => (
                <button
                  key={line}
                  type="button"
                  onClick={() => router.replace(`/app/agents/${params.slug}/sessions/new?objective=${encodeURIComponent(line)}`)}
                  className="flex items-start gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {line}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <AssignmentForm key={objective} workspaceId={shell.workspaceId} canStart={canStart} initialObjective={objective} />
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense>
      <NewSession />
    </Suspense>
  );
}
