import { notFound } from "next/navigation";

import { WorkspacePreview } from "@/components/workspace/preview";
import { PREVIEW_STATES, type PreviewState } from "@/components/workspace/preview-states";

export const dynamic = "force-dynamic";

/**
 * Development only: the agentic workspace drawn from seeded fake records, one
 * lifecycle state or role at a time, for layout checks at every width. Never
 * served by a production build and never reads a real workspace.
 */
export default async function WorkspacePreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const chosen = (PREVIEW_STATES as readonly string[]).includes(state ?? "") ? (state as PreviewState) : "steady";
  return (
    <main className="min-h-svh bg-background px-4 py-6 sm:px-6">
      <WorkspacePreview state={chosen} />
    </main>
  );
}
