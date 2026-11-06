"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Research projects are sessions now; they live in the Growth Architect's folder. */
export default function ResearchProjectRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/app/agents/growth-architect/sessions/${params.id}`);
  }, [params.id, router]);
  return <p className="text-sm text-muted-foreground">Opening the session.</p>;
}
