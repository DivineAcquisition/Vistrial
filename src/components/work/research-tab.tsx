"use client";

import { useQuery } from "convex/react";
import type { ReactNode } from "react";

import { SessionCard, type SessionLite } from "@/components/agents/session-card";
import { StartChat } from "@/components/chat/start-chat";
import { FileSearch, MessagesSquare } from "@/components/icons";
import { IntakeChat } from "@/components/sessions/intake-chat";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { suggestionHref } from "./offers-tab";
import { ReportPdfButton } from "./report-pdf-button";
import type { ResultRow, ReviewActions, TabData } from "./types";
import { useReviewActions } from "./use-review";
import { ResultsList, RunningNow, SectionTitle, SharedLinks, SuggestedNext, WorkHero, WorkLayout } from "./work-shell";

export type ResearchTabProps = {
  base: string;
  editor: boolean;
  chat: ReactNode;
  /** An intake conversation in progress takes the place of the chat box. */
  conversation?: ReactNode;
  tab: TabData;
  sessions: SessionLite[];
  review: ReviewActions;
  pdf: (row: ResultRow) => ReactNode;
};

/** The Research workspace: Market Intelligence's chat, its sessions, reports with their PDF, and next steps. */
export function ResearchTabView({ base, editor, chat, conversation, tab, sessions, review, pdf }: ResearchTabProps) {
  return (
    <WorkLayout
      main={
        <>
          {conversation ?? (
            <WorkHero icon={FileSearch} eyebrow="Growth Architect · Market Intelligence" title="Research" promise="Ask about your market. It asks what it needs, shows the plan and budget, then brings back a report with every source.">
              {chat}
            </WorkHero>
          )}
          <ResultsList
            results={tab.results}
            actions={review}
            editor={editor}
            empty="Finished reports appear here for you to review, each with its sources."
            openHref={(row) => (row.projectId ? `${base}/work/research/${row.projectId}` : `/app/assets/${row.id}`)}
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

/** The Research tab fed by Convex. `?intake=` reopens a conversation; `?ask=` or `?objective=` fills the chat box. */
export function ResearchTab({ workspaceId, base, slug, agentName, editor, intakeId, ask }: { workspaceId: Id<"workspaces">; base: string; slug: string; agentName: string; editor: boolean; intakeId: Id<"intakes"> | null; ask?: string }) {
  const tab = useQuery(api.workTabs.tab, { workspaceId, skillSlug: "market-intelligence" });
  const tree = useQuery(api.agentFolder.tree, { workspaceId, agentSlug: slug, limit: 12 });
  const review = useReviewActions(workspaceId);
  if (!tab) return <p className="text-sm text-muted-foreground">Loading research.</p>;
  return (
    <ResearchTabView
      base={base}
      editor={editor}
      chat={<StartChat defaultAgent={slug} size="compact" placeholder="What do you want to find out about your market?" initialText={ask} />}
      conversation={intakeId ? <IntakeChat key={intakeId} workspaceId={workspaceId} agentSlug={slug} agentName={agentName} intakeId={intakeId} editor={editor} /> : undefined}
      tab={tab}
      // A diagnosis is a session too, but it lives under Diagnostics.
      sessions={(tree?.sessions ?? []).filter((session) => !session.title.startsWith("Growth diagnosis"))}
      review={review}
      pdf={(row) => <ReportPdfButton workspaceId={workspaceId} assetId={row.id} />}
    />
  );
}
