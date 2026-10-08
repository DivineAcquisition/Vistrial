import Link from "next/link";

import { RollbackButton } from "@/components/config/rollback-button";
import { Panel } from "@/components/ui/panel";
import { describeValue } from "@/lib/config/format";
import { FIELD_BY_KEY } from "@/lib/config/registry";
import { diffValues } from "@/lib/config/resolve";
import type { HistoryEntry } from "@/lib/config/screens";
import { bodyText, captionText, sectionTitle } from "@/lib/ui";

const SOURCE_WORDS: Record<string, string> = {
  seed: "Seeded",
  launch: "Launch change",
  migration: "Moved from the old settings",
  edit: "Edited",
  rollback: "Rolled back",
  push: "Locked rule pushed",
  legacy_sync: "Changed on an older settings screen",
  owner_edit: "Changed by the owner",
  create: "Created",
  switch: "Template switched",
};

function changeLine(change: HistoryEntry["changes"][number]): string {
  const label = FIELD_BY_KEY[change.key]?.label ?? change.key;
  if (change.lock) return `${label}: lock ${change.lock}`;
  return `${label}: ${describeValue(change.key, change.before as never)} → ${describeValue(change.key, change.after as never)}`;
}

/**
 * Every version of one level, newest first, with a side-by-side comparison of
 * any two (`?a=` and `?b=` in the URL) and one-step rollback. Rolling back
 * writes a new version; nothing in the history is ever changed.
 */
export function HistoryView({
  entries,
  layerId,
  basePath,
  compare,
  canRollback,
  timeZone,
}: {
  entries: HistoryEntry[];
  layerId: string;
  basePath: string;
  compare: { a?: number; b?: number };
  canRollback: boolean;
  timeZone: string;
}) {
  const latest = entries[0];
  const b = entries.find((entry) => entry.version === compare.b) ?? latest;
  const a = entries.find((entry) => entry.version === compare.a) ?? entries.find((entry) => entry.version < (b?.version ?? 0));
  const diff = a && b ? diffValues(a.values, b.values) : [];

  return (
    <div className="flex flex-col gap-6">
      {a && b ? (
        <Panel className="p-5 sm:p-6">
          <h2 className={sectionTitle}>
            Version {a.version} compared with version {b.version}
          </h2>
          {diff.length ? (
            <div className="mt-3 divide-y divide-border">
              {diff.map((change) => (
                <div key={change.key} className="grid gap-1 py-2 sm:grid-cols-[200px_1fr_1fr] sm:gap-4">
                  <span className="text-sm text-card-foreground">{FIELD_BY_KEY[change.key]?.label ?? change.key}</span>
                  <span className={`${captionText} whitespace-pre-line`}>{describeValue(change.key, change.before)}</span>
                  <span className={`${captionText} whitespace-pre-line`}>{describeValue(change.key, change.after)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={bodyText}>These two versions hold the same values.</p>
          )}
        </Panel>
      ) : null}

      <Panel className="p-5 sm:p-6">
        <h2 className={sectionTitle}>Every version</h2>
        <ul className="mt-2 divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.version} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-card-foreground">
                  Version {entry.version} · {SOURCE_WORDS[entry.source] ?? entry.source}
                </p>
                <p className={captionText}>
                  {entry.changedBy} ·{" "}
                  <time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString("en-US", { timeZone })}</time>
                </p>
                {entry.note ? <p className={captionText}>Why: {entry.note}</p> : null}
                <ul className="mt-1">
                  {entry.changes.slice(0, 6).map((change, index) => (
                    <li key={`${change.key}-${index}`} className={`${captionText} whitespace-pre-line`}>
                      {changeLine(change)}
                    </li>
                  ))}
                  {entry.changes.length > 6 ? <li className={captionText}>…and {entry.changes.length - 6} more</li> : null}
                </ul>
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-2">
                <Link className="text-xs text-muted-foreground underline-offset-2 hover:underline" href={`${basePath}?a=${entry.version}&b=${latest?.version ?? entry.version}`}>
                  Compare with latest
                </Link>
                {canRollback && entry.version !== latest?.version ? <RollbackButton layerId={layerId} toVersion={entry.version} /> : null}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
