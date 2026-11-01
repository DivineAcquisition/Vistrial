"use client";

import { CalculatorIcon, CircleAlertIcon, CircleDashedIcon, FileSearchIcon, LightbulbIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { lineDiff } from "@/lib/diff";

export type EvidenceBasis = "observed" | "inferred" | "hypothesis" | "firstParty" | "insufficient";

export type EvidenceView = {
  claimKey: string;
  statement: string | null;
  /** Null on claims written before bases existed. */
  basis: EvidenceBasis | null;
  computed: boolean;
  fetchedAt: number | null;
  sourceLabel: string | null;
  sourceLabels: (string | null)[];
  /** Set by the server with the same rule approval uses. */
  missing: boolean;
};

export type VersionSummary = { version: number; createdBy: "agent" | "person" | string; createdAt: number };

/** The badge each basis shows, so a reader never mistakes an idea for a finding. */
export const BASIS_LABEL: Record<EvidenceBasis, string> = {
  observed: "Observed",
  inferred: "Inferred from sources",
  hypothesis: "Hypothesis, untested",
  firstParty: "From your data",
  insufficient: "Not enough data",
};

function sourceLine(claim: EvidenceView) {
  if (claim.missing) return "Source not found. Do not approve until this is fixed.";
  if (claim.computed) return "Computed from collected data.";
  const named = claim.sourceLabels.filter((label): label is string => Boolean(label));
  if (named.length === 0) {
    if (claim.basis === "hypothesis") return "An idea to test. No source yet.";
    if (claim.basis === "insufficient") return "There is not enough data to say more.";
    return "No source.";
  }
  return named.length === 1 ? `Source: ${named[0]}` : `Sources: ${named.join("; ")}`;
}

/** Each claim with its basis and evidence beside it. A claim whose source cannot be found says so in red. */
export function EvidenceList({ evidence }: { evidence: EvidenceView[] }) {
  if (evidence.length === 0) return <p className="text-sm text-muted-foreground">This version makes no claims.</p>;
  return (
    <ul className="grid gap-3">
      {evidence.map((claim) => {
        const Icon = claim.missing
          ? CircleAlertIcon
          : claim.computed
            ? CalculatorIcon
            : claim.basis === "hypothesis"
              ? LightbulbIcon
              : claim.basis === "insufficient"
                ? CircleDashedIcon
                : FileSearchIcon;
        const named = claim.sourceLabels.some(Boolean);
        return (
          <li key={claim.claimKey} className="grid gap-1.5 rounded-lg border border-border p-3">
            {claim.basis ? (
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{BASIS_LABEL[claim.basis]}</p>
            ) : null}
            <p className="text-sm text-card-foreground">{claim.statement ?? claim.claimKey}</p>
            <p className={cn("flex flex-wrap items-center gap-1.5 text-xs", claim.missing ? "text-destructive" : "text-muted-foreground")}>
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span>
                {sourceLine(claim)}
                {claim.fetchedAt && named && !claim.missing && !claim.computed ? (
                  <>
                    , read{" "}
                    <time dateTime={new Date(claim.fetchedAt).toISOString()}>
                      {new Date(claim.fetchedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                    .
                  </>
                ) : null}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Versions are never overwritten. Pick one to read, and compare it with the one before. */
export function VersionHistory({
  versions,
  current,
  selected,
  onSelect,
}: {
  versions: VersionSummary[];
  current: number;
  selected: number;
  onSelect: (version: number) => void;
}) {
  return (
    <ol className="grid gap-1" aria-label="Versions">
      {[...versions].reverse().map((row) => (
        <li key={row.version}>
          <button
            type="button"
            aria-current={row.version === selected ? "true" : undefined}
            onClick={() => onSelect(row.version)}
            className={cn(
              "flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              row.version === selected && "bg-accent",
            )}
          >
            <span className="text-card-foreground">
              Version {row.version}
              {row.version === current ? " (current)" : ""}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.createdBy === "agent" ? "By the agent" : "By a person"},{" "}
              {new Date(row.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** What changed between two versions, line by line. Added and removed lines carry a sign as well as a colour. */
export function VersionCompare({ before, after, beforeVersion, afterVersion }: { before: string; after: string; beforeVersion: number; afterVersion: number }) {
  const lines = lineDiff(before, after);
  const changed = lines.some((line) => line.type !== "same");
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Changes from version {beforeVersion} to version {afterVersion}.
      </p>
      {!changed ? <p className="text-sm text-muted-foreground">The text did not change.</p> : null}
      <pre className="max-h-96 overflow-auto rounded-md border border-border font-mono text-xs leading-relaxed">
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              "px-3 whitespace-pre-wrap break-words",
              line.type === "added" && "bg-success/10 text-success",
              line.type === "removed" && "bg-destructive/10 text-destructive line-through decoration-destructive/40",
            )}
          >
            <span aria-hidden="true" className="mr-2 select-none">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <span className="sr-only">{line.type === "added" ? "Added: " : line.type === "removed" ? "Removed: " : ""}</span>
            {line.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
