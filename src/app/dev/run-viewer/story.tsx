"use client";

import { useState } from "react";

import { RunViewer } from "@/components/runs/run-viewer";
import { STORIES } from "@/components/runs/story-fixtures";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FRAME_WIDTHS = [
  { value: "full", label: "Full width" },
  { value: "320", label: "Phone, 320 px" },
  { value: "768", label: "Tablet, 768 px" },
];

/** Every run viewer state from fake data. Development only; the page refuses to render in production. */
export function RunViewerStory() {
  const [key, setKey] = useState(STORIES[0].key);
  const [width, setWidth] = useState("full");
  const story = STORIES.find((row) => row.key === key) ?? STORIES[0];

  return (
    <div className="grid min-h-screen gap-6 bg-background p-4 sm:p-8">
      <div className="mx-auto grid w-full max-w-3xl gap-3 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">Run viewer story page. Fake data, development only.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select aria-label="State" density="compact" value={key} options={STORIES.map((row) => ({ value: row.key, label: row.label }))} onChange={(e) => setKey(e.target.value)} />
          <Select aria-label="Width" density="compact" value={width} options={FRAME_WIDTHS} onChange={(e) => setWidth(e.target.value)} />
        </div>
      </div>
      <div
        className={cn("mx-auto w-full", width !== "full" && "overflow-x-hidden rounded-xl border border-border p-3")}
        style={width === "full" ? undefined : { maxWidth: `${width}px` }}
      >
        <RunViewer
          key={story.key}
          run={story.run}
          skillName={story.skillName ?? "Ad research"}
          now={story.run.startedAt + 42_000}
          connected={story.connected ?? true}
          canStop
          canApprove
          onStop={async () => ({ stopped: story.run.status === "running" || story.run.status === "queued" })}
          onApprove={() => undefined}
          onCopyLink={() => undefined}
          renderArtifactBody={(id) => (
            <pre className="font-mono text-xs whitespace-pre-wrap">{`UNTRUSTED CONTENT\nFake body for artifact ${id}.`}</pre>
          )}
          renderAssetLink={(asset) => <span>{asset.title}</span>}
        />
      </div>
    </div>
  );
}
