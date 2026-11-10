"use client";

import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { BrandsTab } from "@/components/work/brands-tab";
import { WorkGate } from "@/components/work/work-gate";

/** The Brands workspace: a kit for the business and one per client, read by Creative Production. */
export default function BrandsPage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <BrandsTab workspaceId={shell.workspaceId} editor={shell.role !== "rep" && agent?.state !== "off"} />
    </WorkGate>
  );
}
