import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Doc, Id } from "../../_generated/dataModel";
import { parseJson } from "./shapes";

type Db = GenericDatabaseReader<DataModel>;
type StepLike = { _id: Id<"runSteps">; index: number; kind: string; status: string; phase?: string; resultCode: string };

/** The latest step of a phase, or null. */
export function latest<S extends StepLike>(steps: S[], phase: string): S | null {
  let found: S | null = null;
  for (const step of steps) if (step.phase === phase && (!found || step.index > found.index)) found = step;
  return found;
}

/** The latest completed model or tool step of a phase (not a skipped note). */
export function latestDone<S extends StepLike>(steps: S[], phase: string): S | null {
  const step = latest(steps, phase);
  return step && step.status === "completed" && step.kind !== "note" ? step : null;
}

/** A step's saved record of one kind, read back as JSON. */
export async function recordOf(db: Db, run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, stepId: Id<"runSteps">, kind: string) {
  const rows = await db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .order("desc")
    .take(300);
  const row = rows.find((item) => item.stepId === stepId && item.kind === kind);
  return parseJson(row?.body);
}

/** The project a run works on, or null. */
export async function projectOf(db: Db, run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const id = db.normalizeId("researchProjects", run.inputRef);
  const project = id ? await db.get(id) : null;
  return project && project.workspaceId === run.workspaceId ? project : null;
}

/** The project's sources, newest first. */
export async function projectSources(db: Db, workspaceId: Id<"workspaces">, projectId: Id<"researchProjects">, limit = 200) {
  return db
    .query("sourceRefs")
    .withIndex("by_workspace_project", (q) => q.eq("workspaceId", workspaceId).eq("projectId", projectId))
    .order("desc")
    .take(limit);
}
