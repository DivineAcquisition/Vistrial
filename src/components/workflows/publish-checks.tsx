"use client";

import { CircleCheckIcon } from "lucide-react";

import { TodoTool, type TodoItem } from "@/components/agent-elements/tools/todo-tool";
import { describeBox } from "@/lib/workflows/describe";
import { boxById } from "@/lib/workflows/graph";
import type { CheckIssue, WorkflowGraph } from "@/lib/workflows/types";
import { captionText } from "@/lib/ui";

/**
 * The checker's result as a to-do list, on the Agent Elements to-do card.
 * Anything left on it blocks publishing, whoever drew the workflow.
 */
export function PublishChecks({ graph, issues, onSelect }: { graph: WorkflowGraph; issues: CheckIssue[]; onSelect: (id: string) => void }) {
  const errors = [...new Map(issues.filter((issue) => issue.severity === "error").map((issue) => [`${issue.boxId}:${issue.message}`, issue])).values()];
  const warnings = [...new Set(issues.filter((issue) => issue.severity === "warning" && issue.code !== "quiet_hours").map((issue) => issue.message))];
  const titleOf = (boxId: string | null) => {
    const box = boxId ? boxById(graph, boxId) : undefined;
    return box ? describeBox(box).title : null;
  };
  const todos: TodoItem[] = errors.map((issue) => ({
    content: titleOf(issue.boxId) ? `${titleOf(issue.boxId)}: ${issue.message}` : issue.message,
    status: "pending",
  }));
  const firstBox = errors.find((issue) => issue.boxId)?.boxId ?? null;

  return (
    <section aria-labelledby="publish-checks-title" className="flex flex-col gap-3">
      <div>
        <h2 id="publish-checks-title" className="text-base font-medium text-card-foreground">
          Before it can be published
        </h2>
        <p className={captionText}>The same checks run again at publish. A workflow with anything left here cannot go live.</p>
      </div>
      {todos.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/8 p-3 text-sm text-card-foreground">
          <CircleCheckIcon className="size-4 shrink-0 text-success-foreground" aria-hidden />
          Every check passes.
        </p>
      ) : (
        <div className="rounded-xl border bg-card p-3" aria-label={todos.length === 1 ? "1 thing to fix" : `${todos.length} things to fix`}>
          <TodoTool part={{ type: "tool-TodoWrite", toolCallId: "workflow-publish-checks", state: "output-available", input: { todos } }} />
          {firstBox ? (
            <button type="button" className="mt-3 text-sm font-medium text-brand-300 hover:underline" onClick={() => onSelect(firstBox)}>
              Open the first box to fix
            </button>
          ) : null}
        </div>
      )}
      {warnings.length > 0 ? (
        <ul className={`${captionText} space-y-1`} aria-label="Things to know">
          {warnings.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
