"use client";

import { canWork } from "@/lib/roles";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { LandingPages } from "@/components/work/landing-page-view";
import { PagesTab } from "@/components/work/pages-tab";
import { WorkGate } from "@/components/work/work-gate";

function Pages() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      {/* A landing page Strategist built (the first package, for a business with no website) sits first. */}
      <div className="mb-6">
        <LandingPages workspaceId={shell.workspaceId} />
      </div>
      <PagesTab workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} editor={canWork(shell.role) && agent?.state !== "off"} initial={query.get("teardown")} />
    </WorkGate>
  );
}

/** The Pages workspace: landing pages Strategist built, then Landing Page Teardown. `?teardown=` opens one saved teardown. */
export default function PagesPage() {
  return (
    <Suspense>
      <Pages />
    </Suspense>
  );
}
