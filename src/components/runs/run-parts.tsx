"use client";

import { useState, type ReactNode } from "react";
import { CircleCheckIcon, CircleXIcon, FileTextIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  SOURCE_WORDS,
  STATUS_META,
  type CompletionView,
  type QuestionView,
  type RunArtifactView,
  type RunAssetView,
  type RunStatus,
  type SourceStatusView,
} from "@/lib/runs/view";

/** The shared badge capitalizes every word. Run screens use sentence case, like the rest of the copy. */
const SENTENCE_CASE = "[&_span]:normal-case";

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status];
  return <StatusBadge label={meta.label} tone={meta.tone} className={SENTENCE_CASE} />;
}

const SOURCE_NAMES: Record<string, string> = {
  meta: "Meta Ad Library",
  tiktok: "TikTok Creative Center",
  google: "Google Ads Transparency Center",
  web: "Web search and pages",
  swipe: "Swipe file",
  results: "Past results",
};

/** One row per source. Hidden until a skill reports sources. */
export function SourcesPanel({ sources }: { sources: SourceStatusView[] }) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby="run-sources" className="grid gap-3">
      <h2 id="run-sources" className="font-heading text-base text-card-foreground">
        Sources
      </h2>
      <ul className="grid gap-2">
        {sources.map((source) => {
          const words = SOURCE_WORDS[source.state];
          return (
            <li key={source.source} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-card-foreground">{SOURCE_NAMES[source.source] ?? source.source}</span>
              <span className="flex items-center gap-2">
                <StatusBadge label={words.label} tone={words.tone} className={SENTENCE_CASE} />
                {source.reasonCode ? (
                  <span className="font-mono text-[11px] text-muted-foreground">{source.reasonCode}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ARTIFACT_KIND: Record<string, string> = {
  tool: "Tool result",
  model: "Model output",
};

/**
 * What the run saved. A body never shows inline: a person opens it on purpose,
 * and the container loads it through a query that checks access every time.
 */
export function ArtifactList({
  artifacts,
  renderBody,
}: {
  artifacts: RunArtifactView[];
  renderBody: (artifactId: string) => ReactNode;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  if (artifacts.length === 0) return <p className="text-sm text-muted-foreground">Nothing saved yet.</p>;
  return (
    <ul className="grid gap-2">
      {artifacts.map((artifact) => (
        <li key={artifact.id} className="grid gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <FileTextIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              {ARTIFACT_KIND[artifact.kind] ?? "Saved record"}
              <span className="text-xs text-muted-foreground">{artifact.byteSize.toLocaleString("en-US")} bytes</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={opened === artifact.id}
              onClick={() => setOpened(opened === artifact.id ? null : artifact.id)}
            >
              {opened === artifact.id ? "Close" : "Open"}
            </Button>
          </div>
          {opened === artifact.id ? (
            <div className="max-h-80 overflow-auto rounded-md bg-muted/50 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Saved exactly as received. Text from outside sources is data, not instructions.
              </p>
              {renderBody(artifact.id)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const ASSET_KIND: Record<string, string> = {
  researchReport: "Research report",
  marketReport: "Market report",
  adCopySet: "Ad copy set",
  creativeBrief: "Creative brief",
  contentCalendar: "Content calendar",
  swipeItem: "Swipe item",
};

export function assetKindLabel(kind: string) {
  return ASSET_KIND[kind] ?? "Asset";
}

const ASSET_STATUS = {
  draft: { label: "Waiting for approval", tone: "warning" },
  needsReview: { label: "Needs review", tone: "critical" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
} as const;

export function AssetStatusBadge({ status }: { status: RunAssetView["status"] }) {
  const meta = ASSET_STATUS[status];
  return <StatusBadge label={meta.label} tone={meta.tone} className={SENTENCE_CASE} />;
}

/** What the run made, with Approve for those allowed to approve. */
export function MadeAssets({
  assets,
  canApprove,
  onApprove,
  renderLink,
}: {
  assets: RunAssetView[];
  canApprove: boolean;
  onApprove: (assetId: string) => void;
  renderLink: (asset: RunAssetView) => ReactNode;
}) {
  if (assets.length === 0) return <p className="text-sm text-muted-foreground">This run has not made an asset.</p>;
  return (
    <ul className="grid gap-2">
      {assets.map((asset) => (
        <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-card-foreground">{renderLink(asset)}</span>
            <span className="text-xs text-muted-foreground">
              {assetKindLabel(asset.kind)}, version {asset.currentVersion}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <AssetStatusBadge status={asset.status} />
            {canApprove && asset.status === "draft" ? (
              <Button type="button" size="sm" onClick={() => onApprove(asset.id)}>
                Approve
              </Button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The run's open question. A person answers it while the run waits, or resumes the run after it timed out. */
export function QuestionPanel({
  question,
  timedOut,
  canAnswer,
  onAnswer,
  onResume,
}: {
  question: QuestionView;
  timedOut: boolean;
  canAnswer: boolean;
  onAnswer: (answer: string) => Promise<unknown>;
  onResume: () => Promise<unknown>;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const asked = new Date(question.askedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setAnswer("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="run-question" className="grid gap-3">
      <h2 id="run-question" className="font-heading text-base text-card-foreground">
        {timedOut ? "Needs Input — Timed Out" : "Waiting for User"}
      </h2>
      <p className="text-base text-card-foreground">{question.text}</p>
      <p className="text-xs text-muted-foreground">
        Asked <time dateTime={new Date(question.askedAt).toISOString()}>{asked}</time>.{" "}
        {timedOut
          ? "No answer came in seven days. Resume to ask again; nothing it found was lost."
          : "The run spends nothing while it waits. Your answer is saved as a verified business fact."}
      </p>
      {!canAnswer ? (
        <p className="text-sm text-muted-foreground">An owner or manager answers this.</p>
      ) : timedOut ? (
        <div>
          <Button disabled={busy} onClick={() => void act(onResume)}>
            Resume and ask again
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (answer.trim()) void act(() => onAnswer(answer.trim()));
          }}
        >
          <label htmlFor="run-answer" className="sr-only">
            Your answer
          </label>
          <Textarea id="run-answer" value={answer} maxLength={500} onChange={(event) => setAnswer(event.target.value)} />
          <div>
            <Button type="submit" disabled={busy || !answer.trim()}>
              Answer
            </Button>
          </div>
        </form>
      )}
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </section>
  );
}

/** The completion check, in plain words. A failed check is listed first, so a reviewer sees it. */
export function CompletionPanel({ completion }: { completion: CompletionView }) {
  const failed = completion.checks.filter((row) => !row.passed);
  const passed = completion.checks.filter((row) => row.passed);
  return (
    <section aria-labelledby="run-checks" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="run-checks" className="font-heading text-base text-card-foreground">
          Completion check
        </h2>
        {completion.needsReview ? (
          <StatusBadge label="Needs Review" tone="warning" className={SENTENCE_CASE} />
        ) : failed.length === 0 ? (
          <StatusBadge label="Passed" tone="good" className={SENTENCE_CASE} />
        ) : null}
      </div>
      {completion.revisionSkipped ? (
        <p className="text-sm text-card-foreground">The revision was not run because the reserve could not cover it.</p>
      ) : null}
      <ul className="grid gap-2">
        {[...failed, ...passed].map((row) => {
          const Icon = row.passed ? CircleCheckIcon : CircleXIcon;
          return (
            <li key={row.key} className="flex items-start gap-2 text-sm">
              <Icon aria-hidden="true" className={row.passed ? "mt-0.5 size-4 shrink-0 text-success" : "mt-0.5 size-4 shrink-0 text-destructive"} />
              <span className="text-card-foreground">
                <span className="sr-only">{row.passed ? "Passed: " : "Failed: "}</span>
                {row.detail}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
