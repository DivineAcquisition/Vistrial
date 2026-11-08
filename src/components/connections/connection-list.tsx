"use client";

import { useQuery } from "convex/react";
import { ArrowRight, Camera, FileSpreadsheet, Globe, Megaphone, PlaySquare, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { MetaLogo } from "@/components/connections/meta-logo";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Connections with their own page in the agent's folder. */
const PAGES: Record<string, string> = { meta: "meta", results: "results" };

const STATE: Record<string, { label: string; tone: "good" | "warning" | "neutral" }> = {
  on: { label: "On", tone: "good" },
  attention: { label: "Needs attention", tone: "warning" },
  notGranted: { label: "Not granted to this agent", tone: "neutral" },
  off: { label: "Not connected", tone: "neutral" },
};

const ABOUT: Record<string, { icon: LucideIcon | null; kind: string; words: string }> = {
  meta: { icon: null, kind: "Your results", words: "Your own Facebook and Instagram ad results, read-only. Used as first-party evidence." },
  results: { icon: FileSpreadsheet, kind: "Your results", words: "Exports from your other tools: Google Ads, your CRM, bookings, email. Only totals are kept." },
  youtube: { icon: PlaySquare, kind: "Research source", words: "Public videos through the official YouTube API. Plays in its own player." },
  instagram: { icon: Camera, kind: "Research source", words: "Public posts you paste, shown with Instagram's official embed once Meta approves the app." },
  adLibrary: { icon: Megaphone, kind: "Research source", words: "Public ads from Meta's Ad Library. Commercial ads are only available for the EU and UK." },
};

/** Everything an agent can draw on, its own results first, then research sources. */
export function ConnectionList({ workspaceId, agentSlug }: { workspaceId: Id<"workspaces">; agentSlug: string }) {
  const tree = useQuery(api.agentFolder.tree, { workspaceId, agentSlug, limit: 1 });
  if (tree === undefined) return <p className="text-sm text-muted-foreground">Loading connections.</p>;
  const base = `/app/agents/${agentSlug}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tree.connections.map((row) => {
        const about = ABOUT[row.key];
        const state = STATE[row.state];
        const Icon = about?.icon ?? Globe;
        const body = (
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-background">
                  {row.key === "meta" ? <MetaLogo className="h-4" /> : <Icon aria-hidden className="size-4 text-muted-foreground" />}
                </span>
                <span className="grid">
                  <span className="font-medium text-card-foreground">{row.label}</span>
                  <span className="text-xs text-muted-foreground">{about?.kind}</span>
                </span>
              </span>
              <StatusBadge label={state.label} tone={state.tone} className="shrink-0 [&_span]:normal-case" />
            </span>
            <span className="text-sm text-muted-foreground">{about?.words}</span>
            {row.detail ? <span className="text-xs text-muted-foreground">{row.key === "meta" ? `Reading ${row.detail}` : row.detail}</span> : null}
            {PAGES[row.key] ? (
              <span className="flex items-center gap-1 text-sm text-primary">
                Open <ArrowRight aria-hidden className="size-3.5" />
              </span>
            ) : null}
          </>
        );
        const className = cn("grid content-start gap-2 rounded-xl border border-border bg-card p-4", PAGES[row.key] && "transition-colors hover:border-primary/40");
        return PAGES[row.key] ? (
          <Link key={row.key} id={row.key} href={`${base}/connections/${PAGES[row.key]}`} className={className}>
            {body}
          </Link>
        ) : (
          <div key={row.key} id={row.key} className={className}>
            {body}
          </div>
        );
      })}
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground sm:col-span-2">
        <span>Connections belong to the workspace. Connect, reconnect or change them in Connections; this folder shows what this agent may use.</span>
        <Link href="/app/connections" className="flex items-center gap-1 text-primary">
          Manage in Connections <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </Panel>
    </div>
  );
}
