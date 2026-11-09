"use client";

import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { WorkSession } from "@/components/work/work-session";
import type { Id } from "../../../../../../../../../convex/_generated/dataModel";

/** One session, opened in the Diagnostics workspace. */
export default function DiagnosticsSessionPage() {
  const params = useParams<{ slug: string; id: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  return <WorkSession shell={shell} slug={params.slug} projectId={params.id as Id<"researchProjects">} tab="diagnostics" />;
}
