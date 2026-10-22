import { notFound } from "next/navigation";

import { AgentElementsPreview } from "@/app/preview/agent-elements/view";

export const dynamic = "force-dynamic";

/** Development only. The shared agent cards, with no signed-in workspace. */
export default function AgentElementsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AgentElementsPreview />;
}
