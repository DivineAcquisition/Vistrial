"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** New research starts in the Growth Architect's chat, preset for research. */
export default function NewAssignmentRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/agents/growth-architect/work/chat?skill=market-intelligence");
  }, [router]);
  return <p className="text-sm text-muted-foreground">Opening the chat.</p>;
}
