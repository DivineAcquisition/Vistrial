import type { QueueRow } from "@/lib/queue/types";

export type QueueCursor = {
  u: number;
  s: number;
  t: string | null;
  id: string;
};

export function cursorFromRow(row: QueueRow): QueueCursor {
  return {
    u: row.urgencyRank ?? 99,
    s: row.sortScore,
    t: row.lastTouchAt,
    id: row.id,
  };
}

export function encodeQueueCursor(cursor: QueueCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeQueueCursor(value: string | null | undefined): QueueCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<QueueCursor>;
    if (typeof parsed.u !== "number" || typeof parsed.s !== "number" || typeof parsed.id !== "string") {
      return null;
    }
    return {
      u: parsed.u,
      s: parsed.s,
      t: typeof parsed.t === "string" ? parsed.t : null,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}
