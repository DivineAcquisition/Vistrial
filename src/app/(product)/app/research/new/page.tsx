"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** New research starts as a session in the Growth Architect's folder. */
export default function NewAssignmentRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/agents/growth-architect/sessions/new");
  }, [router]);
  return <p className="text-sm text-muted-foreground">Opening a new session.</p>;
}
