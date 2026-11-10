import { Plus } from "@/components/icons";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** The one action every empty page offers: open the agent's chat, where work starts. */
export function StartSessionButton({
  agentSlug = "growth-architect",
  label = "Start a session",
}: {
  agentSlug?: string;
  label?: string;
}) {
  return (
    <Button render={<Link href={`/app/agents/${agentSlug}/work/chat`} />}>
      <Plus aria-hidden /> {label}
    </Button>
  );
}
