/**
 * Ordering and collapse for the attention view.
 *
 * Items are never grouped by feature area. Within a priority band, escalated
 * items sort above the rest, then oldest first.
 */

import {
  COLLAPSE_AT,
  ESCALATION_MS,
  TYPE_PRIORITY,
  type AttentionItem,
  type AttentionRow,
  type AttentionType,
} from "@/lib/attention/types";

export function isEscalated(
  type: AttentionType,
  ageMs: number
): boolean {
  return ageMs >= ESCALATION_MS[type];
}

export function compareItems(a: AttentionItem, b: AttentionItem): number {
  const byType = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
  if (byType !== 0) return byType;

  if (a.escalated !== b.escalated) return a.escalated ? -1 : 1;

  // Oldest first within the band.
  return b.ageMs - a.ageMs;
}

export function sortItems(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort(compareItems);
}

/**
 * Collapse types that have many individual instances into one expandable row.
 * Types that are already a single aggregate row (count of one by construction)
 * pass through unchanged.
 */
export function collapseRows(items: AttentionItem[]): AttentionRow[] {
  const sorted = sortItems(items);
  const byType = new Map<AttentionType, AttentionItem[]>();

  for (const item of sorted) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }

  // Emit in priority order of types that actually have items.
  const types = [...byType.keys()].sort(
    (a, b) => TYPE_PRIORITY[a] - TYPE_PRIORITY[b]
  );

  const rows: AttentionRow[] = [];

  for (const type of types) {
    const group = byType.get(type) ?? [];
    if (group.length === 0) continue;

    // Aggregates that are already one logical row keep a single item shape when
    // there is only one; when the query produced one count-row, length is 1.
    if (group.length >= COLLAPSE_AT) {
      const oldestAgeMs = Math.max(...group.map((item) => item.ageMs));
      rows.push({
        kind: "group",
        type,
        count: group.length,
        oldestAgeMs,
        escalated: group.some((item) => item.escalated),
        items: group,
      });
      continue;
    }

    for (const item of group) {
      rows.push({ kind: "item", item });
    }
  }

  return rows;
}

/** Human age for the list. Hours under a day, days thereafter. */
export function formatAge(ageMs: number): string {
  if (ageMs < 60 * 1000) return "just now";
  if (ageMs < 60 * 60 * 1000) {
    const minutes = Math.floor(ageMs / (60 * 1000));
    return `${minutes}m`;
  }
  if (ageMs < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    return `${hours}h`;
  }
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return `${days}d`;
}
