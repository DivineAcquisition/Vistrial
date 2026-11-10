"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Activity } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Starts a Growth Diagnostics session: a project scoped to the business's own data, and the run, then
 * opens the session. The skill reads only this workspace's connected results and changes nothing in them.
 */
export function StartDiagnosisButton({ workspaceId, agentSlug }: { workspaceId: Id<"workspaces">; agentSlug: string }) {
  const router = useRouter();
  const createProject = useMutation(api.research.createProject);
  const start = useMutation(api.runs.start);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  return (
    <span className="grid justify-items-end gap-1">
      <Button
        type="button"
        className="w-fit"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setProblem("");
          try {
            const projectId = await createProject({
              workspaceId,
              title: `Growth diagnosis, ${new Date().toISOString().slice(0, 10)}`,
              objective: "Where does growth stall, from our own data?",
              market: "",
              geography: "",
              competitors: [],
              platforms: ["customerData"],
              suppliedUrls: [],
            });
            await start({ workspaceId, agentSlug, skillSlug: "growth-diagnostics", projectId });
            router.push(`/app/agents/${agentSlug}/work/diagnostics/${projectId}`);
          } catch (error) {
            setProblem(showError(error, "The diagnosis did not start."));
            setBusy(false);
          }
        }}
      >
        <Activity aria-hidden /> {busy ? "Starting…" : "Run diagnosis"}
      </Button>
      {problem ? <span className="text-xs text-destructive">{problem}</span> : null}
    </span>
  );
}
