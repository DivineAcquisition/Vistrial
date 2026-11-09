import { Plus } from "@/components/icons";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** The one action every empty page offers: start a session with the agent that fills it. */
export function StartSessionButton({
  agentSlug = "growth-architect",
  label = "Start a session",
}: {
  agentSlug?: string;
  label?: string;
}) {
  return (
    <Button render={<Link href={`/app/agents/${agentSlug}/work/research`} />}>
      <Plus aria-hidden /> {label}
    </Button>
  );
}
