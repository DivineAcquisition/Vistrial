"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SessionCard, type SessionLite } from "@/components/agents/session-card";
import { FileSearch, MessagesSquare, Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { ReportPdfButton } from "./report-pdf-button";
import type { ResultRow, ReviewActions, TabData } from "./types";
import { useReviewActions } from "./use-review";
import { ResultsList, RunningNow, SectionTitle, SharedLinks, SuggestedNext, WorkHero, WorkLayout, refineLink, suggestionHref } from "./work-shell";

export type ResearchTabProps = {
  base: string;
  editor: boolean;
  tab: TabData;
  sessions: SessionLite[];
  review: ReviewActions;
  pdf: (row: ResultRow) => ReactNode;
};

/**
 * The Research workspace: the reports library with review and PDF export, what is running, and each
 * session. There is no chat box here: "New research" opens the Chat tab, preset for research.
 */
export function ResearchTabView({ base, editor, tab, sessions, review, pdf }: ResearchTabProps) {
  return (
    <WorkLayout
      main={
        <>
          <WorkHero
            icon={FileSearch}
            eyebrow="Growth Architect · Market Intelligence"
            title="Research"
            promise="Your reports library: every report with its sources, ready to approve, send back or export as a PDF."
            action={
              editor ? (
                <Button render={<Link href={`${base}/work/chat?skill=market-intelligence`} />}>
                  <Plus aria-hidden className="size-4" /> New research
                </Button>
              ) : null
            }
          />
          <ResultsList
            results={tab.results}
            actions={review}
            editor={editor}
            empty="Finished reports appear here for you to review, each with its sources. Start one with New research."
            openHref={(row) => (row.projectId ? `${base}/work/research/${row.projectId}` : `/app/assets/${row.id}`)}
            refineHref={(row) => refineLink(base, "market-intelligence", { kind: "asset", id: row.id, title: row.title })}
            extra={(row) => (row.status === "rejected" ? null : pdf(row))}
          />
          <section className="grid gap-3" aria-label="Sessions">
            <SectionTitle icon={MessagesSquare}>Sessions</SectionTitle>
            {sessions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Each question you research becomes a session: you ask, it studies, you review.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sessions.map((session) => (
                  <SessionCard key={session.id} session={session} href={`${base}/work/research/${session.id}`} />
                ))}
              </div>
            )}
          </section>
        </>
      }
      rail={
        <>
          <RunningNow running={tab.running} finished={tab.finished} sessionHref={(projectId) => `${base}/work/research/${projectId}`} />
          <SuggestedNext suggestions={tab.suggestions} hrefFor={(row) => suggestionHref(base, row)} />
          <SharedLinks base={base} />
        </>
      }
    />
  );
}

/** The Research tab fed by Convex. */
export function ResearchTab({ workspaceId, base, slug, editor }: { workspaceId: Id<"workspaces">; base: string; slug: string; editor: boolean }) {
  const tab = useQuery(api.workTabs.tab, { workspaceId, skillSlug: "market-intelligence" });
  const tree = useQuery(api.agentFolder.tree, { workspaceId, agentSlug: slug, limit: 12 });
  const review = useReviewActions(workspaceId);
  if (!tab) return <p className="text-sm text-muted-foreground">Loading research.</p>;
  return (
    <ResearchTabView
      base={base}
      editor={editor}
      tab={tab}
      // A diagnosis is a session too, but it lives under Diagnostics.
      sessions={(tree?.sessions ?? []).filter((session) => !session.title.startsWith("Growth diagnosis"))}
      review={review}
      pdf={(row) => <ReportPdfButton workspaceId={workspaceId} assetId={row.id} />}
    />
  );
}
