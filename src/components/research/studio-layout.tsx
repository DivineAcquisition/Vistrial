"use client";

import Link from "next/link";
import { useState } from "react";

import { LiveActivity } from "@/components/research/live-activity";
import { ApprovalCard, ChecksList, FindingsView, type SourceLite } from "@/components/research/findings";
import { BriefCard, ContextPanel, QuestionCard, SourceStatusList, StageProgress, type Studio } from "@/components/research/studio-parts";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { SegmentedControl } from "@/components/ui/tabs";
import type { Tone } from "@/components/ui/tone";
import { PLATFORM_LABEL } from "@/lib/research/words";
import type { Id } from "../../../convex/_generated/dataModel";
import { useCredits } from "@/lib/credits";

type Section = "context" | "research" | "findings" | "assets" | "review";

/** The five sections of an assignment, in the order the work moves through them. */
const SECTIONS: { value: Section; label: string; words: string }[] = [
  { value: "context", label: "Context", words: "What the agent knows about your business, and the brief it works from." },
  { value: "research", label: "Research", words: "The work as it happens, then every source it found or was given, with its own player or a link." },
  { value: "findings", label: "Findings", words: "What the sources show, what it infers, and the opportunities it picked." },
  { value: "assets", label: "Assets", words: "The finished work from this assignment." },
  { value: "review", label: "Review", words: "Check the work, ask for changes, or approve it." },
];

/**
 * The Research Studio's layout (context-engine-brief, "What the user sees"): the current objective with
 * status chips, any question for the person, progress and sources at the side, and the five sections.
 * Data comes in as props, so the real page and the story page render the same thing.
 */
export function StudioLayout({
  workspaceId,
  studio,
  steps,
  open,
  meta,
  statuses,
  counts,
  sources,
  assetStatus,
  reportAsset,
  capCents,
  editor,
  researchSlot,
  initialSection,
}: {
  workspaceId: Id<"workspaces">;
  studio: Studio;
  steps: { phase?: string | null; status: string; kind: string; resultCode: string; webSearches?: number; webFetches?: number; at?: number }[];
  open: boolean;
  meta: { label: string; tone: Tone } | null;
  statuses: { platform: string; state: string; reasonCode: string; found: number }[];
  counts: Map<string, number>;
  sources: Map<string, SourceLite>;
  assetStatus: string | null;
  reportAsset: { id: string; title: string; status: string; currentVersion: number } | null;
  capCents: number;
  editor: boolean;
  researchSlot: React.ReactNode;
  /** Opens a section directly (story pages). */
  initialSection?: string;
}) {
  const credits = useCredits();
  const [section, setSection] = useState<Section | null>(() => SECTIONS.find((row) => row.value === initialSection)?.value ?? null);
  const hasContext = Boolean(studio.context && (studio.context.profile || studio.context.facts.length > 0));
  const sourceCount = sources.size;
  const runStatus = studio.run?.status ?? null;
  const working = runStatus === "running" || runStatus === "queued";
  const shownSection: Section = section ?? (working ? "research" : studio.report ? "findings" : sourceCount > 0 ? "research" : "context");
  const sourceList = [...sources.values()];

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Growth Architect · Market Intelligence"
        title={studio.project.title}
        status={meta?.label}
        statusTone={meta?.tone}
        breadcrumbs={[{ label: "Research", href: "/app/research" }, { label: studio.project.title, href: `/app/research/${studio.project.id}` }]}
      />

      <Panel className="grid gap-3 p-4 sm:p-5">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Current objective</p>
        <p className="font-heading text-lg break-words text-card-foreground">{studio.project.objective}</p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={hasContext ? "Business context loaded" : studio.context ? "No business context yet" : "Context not read yet"}
            tone={hasContext ? "good" : "warning"}
            className="[&_span]:normal-case"
          />
          <StatusBadge
            label={sourceCount > 0 ? `${sourceCount} sources collected` : open ? "Research needed" : "No research yet"}
            tone={sourceCount > 0 ? "good" : "neutral"}
            className="[&_span]:normal-case"
          />
          {studio.checks ? (
            <StatusBadge label={studio.checks.passed ? "All checks passed" : "Needs review"} tone={studio.checks.passed ? "good" : "critical"} className="[&_span]:normal-case" />
          ) : null}
        </div>
        {working && shownSection !== "research" ? (
          <button
            type="button"
            onClick={() => setSection("research")}
            className="flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm text-primary hover:bg-primary/10"
          >
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Working now. Watch it live
          </button>
        ) : null}
      </Panel>

      <QuestionCard workspaceId={workspaceId} studio={studio} canAnswer={editor} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="order-2 grid min-w-0 content-start gap-4 lg:order-1" aria-label="Progress">
          <Panel className="grid gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-base text-card-foreground">Progress</h2>
              {studio.run ? (
                <Link className="text-sm underline-offset-4 hover:underline" href={`/app/runs/${studio.run.id}`}>
                  Every step
                </Link>
              ) : null}
            </div>
            {studio.run ? (
              <>
                <StageProgress steps={steps} open={open} />
                <p className="text-sm text-muted-foreground">
                  Spent {credits.cost(studio.run.costCents)} of {credits.cost(capCents)}.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not started.</p>
            )}
          </Panel>
          <Panel className="grid gap-3 p-4">
            <h2 className="font-heading text-base text-card-foreground">Sources</h2>
            <SourceStatusList statuses={statuses} />
            {counts.size > 0 ? (
              <p className="text-xs text-muted-foreground">
                Kept on this project: {[...counts.entries()].map(([platform, n]) => `${n} ${PLATFORM_LABEL[platform] ?? platform}`).join(", ")}.
              </p>
            ) : null}
          </Panel>
        </aside>

        <div className="order-1 grid min-w-0 content-start gap-4 lg:order-2">
          <div className="overflow-x-auto">
            <SegmentedControl<Section>
              label="Section"
              options={SECTIONS.map((row) => ({ value: row.value, label: row.label }))}
              value={shownSection}
              onChange={setSection}
            />
          </div>
          <p className="text-sm text-muted-foreground">{SECTIONS.find((row) => row.value === shownSection)?.words}</p>

          {shownSection === "context" ? (
            <>
              <ContextPanel workspaceId={workspaceId} studio={studio} canEdit={editor} />
              <BriefCard studio={studio} capCents={capCents} />
            </>
          ) : null}
          {shownSection === "research" ? (
            <>
              <LiveActivity
                steps={steps}
                sources={sourceList}
                status={runStatus}
                startedAt={studio.run?.startedAt ?? null}
                finishedAt={studio.run?.finishedAt ?? null}
                costCents={studio.run?.costCents ?? 0}
              />
              {researchSlot}
            </>
          ) : null}
          {shownSection === "findings" ? (
            <FindingsView
              workspaceId={workspaceId}
              studio={studio}
              sources={sources}
              assetStatus={assetStatus}
              canDecide={editor}
              boardHref={`/app/research/${studio.project.id}/board`}
              showDecision={false}
            />
          ) : null}
          {shownSection === "assets" ? (
            <Panel className="grid gap-3 p-4 sm:p-5">
              <h2 className="font-heading text-base text-card-foreground">Assets from this assignment</h2>
              {reportAsset ? (
                <div className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid min-w-0 gap-1">
                    <Link className="font-medium break-words text-card-foreground underline-offset-4 hover:underline" href={`/app/assets/${reportAsset.id}`}>
                      {reportAsset.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      Market report, version {reportAsset.currentVersion}
                      {reportAsset.currentVersion > 1 ? ". Earlier versions are kept, and you can compare them." : "."}
                    </p>
                  </div>
                  <AssetStatusBadge status={reportAsset.status as "draft"} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">The report appears here when it is written.</p>
              )}
              <p className="text-sm text-muted-foreground">
                Campaigns, copy, scripts and creative briefs come from Creative Production, a separate skill that starts from the approved report, with its own budget shown before it runs.
              </p>
            </Panel>
          ) : null}
          {shownSection === "review" ? (
            <>
              {studio.checks ? (
                <Panel className="grid gap-3 p-4 sm:p-5">
                  <h2 className="font-heading text-base text-card-foreground">Completion checks</h2>
                  <ChecksList checks={studio.checks} />
                </Panel>
              ) : null}
              {studio.assetId && assetStatus ? (
                <ApprovalCard workspaceId={workspaceId} assetId={studio.assetId as Id<"assets">} status={assetStatus} canDecide={editor} />
              ) : (
                <Panel className="p-4 sm:p-5">
                  <p className="text-sm text-muted-foreground">Nothing to review yet. The report comes here once it is written and checked.</p>
                </Panel>
              )}
            </>
          ) : null}

          {!studio.run && editor ? (
            <Panel className="p-4">
              <Button render={<Link href="/app/research/new" />}>Start a new assignment</Button>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
