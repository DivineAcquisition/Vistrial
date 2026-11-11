"use client";

import { ReportPdfControls } from "@/components/work/report-pdf-button";
import { ResearchTabView } from "@/components/work/research-tab";
import { buildReportPdf } from "@/lib/report-pdf/model";

import { STORY_NOW, storyReportPdf, storyTab } from "../work-tabs/fixtures";
import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;

const SESSIONS = [
  { id: "p1", title: "Lead-gen retainers for home-service brands", objective: "What do competing agencies lead with?", geography: "Texas", state: "working", updatedAt: STORY_NOW - 4 * 60_000, costCents: 38 },
  { id: "p0", title: "Paid ads management pricing", objective: "What do agencies charge roofers and HVAC brands?", geography: "Texas", state: "done", updatedAt: STORY_NOW - 20 * 86_400_000, costCents: 84 },
];

/** The Research workspace with fixture data. Its PDF button builds the real PDF from the story report. */
export function ResearchTabStory({ state, theme }: { state: string; theme: string }) {
  const editor = state !== "rep";
  return (
    <StoryFrame tab="work/research" theme={theme} role={editor ? "owner" : "viewer"}>
      <ResearchTabView
        base="/app/agents/growth-architect"
        editor={editor}
        tab={storyTab("market-intelligence", state)}
        sessions={state === "empty" ? [] : SESSIONS}
        review={{ approve: noop, reject: noop, requestChanges: noop }}
        pdf={() => (
          <ReportPdfControls
            onDownload={async (branding) => {
              const [{ pdf }, { ReportPdf }] = await Promise.all([import("@react-pdf/renderer"), import("@/components/work/report-pdf")]);
              const blob = await pdf(ReportPdf({ model: buildReportPdf(storyReportPdf(), { branding, generatedAt: STORY_NOW }) })).toBlob();
              window.open(URL.createObjectURL(blob), "_blank");
            }}
          />
        )}
      />
    </StoryFrame>
  );
}
