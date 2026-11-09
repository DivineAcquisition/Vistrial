"use client";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ReportPdfControls } from "@/components/work/report-pdf-button";
import { ResearchTabView } from "@/components/work/research-tab";
import { buildReportPdf } from "@/lib/report-pdf/model";

import { STORY_NOW, storyReportPdf, storyTab } from "../work-tabs/fixtures";
import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;

const SESSIONS = [
  { id: "p1", title: "Austin deep cleaning", objective: "What do competitors lead with?", geography: "Austin, TX", state: "working", updatedAt: STORY_NOW - 4 * 60_000, costCents: 38 },
  { id: "p0", title: "Move-out cleaning, Austin", objective: "Who wins move-out jobs?", geography: "Austin, TX", state: "done", updatedAt: STORY_NOW - 20 * 86_400_000, costCents: 84 },
];

/** The Research workspace with fixture data. Its PDF button builds the real PDF from the story report. */
export function ResearchTabStory({ state, theme }: { state: string; theme: string }) {
  const editor = state !== "rep";
  return (
    <StoryFrame tab="work/research" theme={theme} role={editor ? "owner" : "rep"}>
      <ResearchTabView
        base="/app/agents/growth-architect"
        editor={editor}
        chat={<ChatComposer size="compact" placeholder="What do you want to find out about your market?" disabled={!editor} onSubmit={noop} agent={{ value: "growth-architect", options: [{ slug: "growth-architect", name: "Growth Architect", live: true }], locked: true }} />}
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
