import type { CaseListRow, CaseSort, CaseTimelineEntry } from "@/lib/cases/types";

export type CaseListCursor = {
  id: string;
  t?: string | null;
  s?: number | null;
  st?: string | null;
};

export function cursorFromCaseRow(row: CaseListRow, sort: CaseSort): CaseListCursor {
  if (sort === "score") return { id: row.id, s: row.score };
  if (sort === "status") return { id: row.id, st: row.status };
  if (sort === "opted_in") return { id: row.id, t: row.optedInAt };
  return { id: row.id, t: row.lastTouchAt };
}

export function encodeCaseCursor(cursor: CaseListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCaseCursor(value: string | null | undefined): CaseListCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CaseListCursor>;
    if (typeof parsed.id !== "string") return null;
    return {
      id: parsed.id,
      t: typeof parsed.t === "string" ? parsed.t : parsed.t === null ? null : undefined,
      s: typeof parsed.s === "number" ? parsed.s : parsed.s === null ? null : undefined,
      st: typeof parsed.st === "string" ? parsed.st : null,
    };
  } catch {
    return null;
  }
}

export type CaseTimelineCursor = {
  at: string;
  id: string;
};

export function cursorFromTimelineEntry(entry: CaseTimelineEntry): CaseTimelineCursor {
  return { at: entry.at, id: entry.id };
}
