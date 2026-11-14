/**
 * The objection playbook as plain Markdown for the asset body, and the talk tracks the Playbook screen shows.
 * The counts and quotes are the business's own data, counted in code; each talk track is an untested hypothesis.
 */

import type { Id } from "../../_generated/dataModel";
import type { ChecksRecord, TrackRecord, Tracks } from "./shapes";

/** The talk tracks that hold: for an objection shown, naming only offer items that exist. */
export function settledTracks(draft: Tracks, record: TrackRecord) {
  const objections = new Map(record.objections.map((row) => [row.id, row]));
  const offer = new Map(record.offer.map((row) => [row.id, row]));
  const seen = new Set<string>();
  return draft.tracks.flatMap((row) => {
    const objection = objections.get(row.objectionId);
    if (!objection || !row.track || seen.has(row.objectionId)) return [];
    seen.add(row.objectionId);
    const named = row.offerIds.map((id) => offer.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    return [{ objection, track: row.track, offer: named }];
  });
}

export function renderTracks(draft: Tracks, record: TrackRecord, checks: ChecksRecord, notes: string[]) {
  const lines = ["# Objection playbook", "", `_From ${record.calls} call(s) reviewed or noted. Counts and quotes: your data, counted in code. Talk tracks: Untested hypothesis until used on a call._`, ""];
  if (!checks.passed) {
    lines.push("## Needs review", "", "These talk tracks did not pass every completion check:", "");
    for (const row of checks.results.filter((item) => !item.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  const tracks = new Map(settledTracks(draft, record).map((row) => [row.objection.id, row]));
  for (const objection of record.objections) {
    lines.push(`## ${objection.title}`, "", `Heard on ${objection.heard} call(s). ${objection.workedWords}`.trim(), "");
    for (const quote of objection.quotes) lines.push(`> "${quote}" _(Buyer's words)_`);
    if (objection.quotes.length) lines.push("");
    const row = tracks.get(objection.id);
    if (row) {
      lines.push(`**Talk track** _(Untested hypothesis)_: ${row.track}`);
      if (row.offer.length) lines.push("", `Stands on: ${row.offer.map((item) => item.title).join("; ")}.`);
    } else lines.push("No talk track was written for this one.");
    lines.push("");
  }
  if (record.missing.length) {
    lines.push("## What this could not use", "");
    for (const text of record.missing) lines.push(`- ${text}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** The talk tracks as the objection runs row keeps them, by the Playbook items' own ids. */
export function tracksOf(draft: Tracks, record: TrackRecord) {
  return settledTracks(draft, record).map((row) => ({
    itemId: row.objection.itemId as Id<"playbookItems">,
    track: row.track,
    offer: row.offer.map((item) => ({ itemId: item.itemId as Id<"playbookItems">, title: item.title })),
  }));
}
