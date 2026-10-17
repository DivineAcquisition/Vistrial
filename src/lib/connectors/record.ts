export type FieldValue = { value: string; source: string };

export type FieldMerge = {
  value: string | null;
  source: string | null;
  disagreement: { left: FieldValue; right: FieldValue } | null;
};

/**
 * The chosen record wins. Another source fills a field only when it is empty.
 * A disagreement is shown and is never written back.
 */
export function mergeField(args: {
  record: FieldValue | null;
  other: FieldValue | null;
}): FieldMerge {
  if (!args.record && !args.other) return { value: null, source: null, disagreement: null };
  if (!args.other) return { value: args.record!.value, source: args.record!.source, disagreement: null };
  if (!args.record || !args.record.value) {
    return { value: args.other.value, source: args.other.source, disagreement: null };
  }
  if (args.record.value === args.other.value) {
    return { value: args.record.value, source: args.record.source, disagreement: null };
  }
  return {
    value: args.record.value,
    source: args.record.source,
    disagreement: { left: args.record, right: args.other },
  };
}

export type OptState = { optedOut: boolean; source: string | null };

/** An opt-out is never cleared by another source saying the opposite. */
export function applyOptMarker(state: OptState, incoming: { optedOut: boolean; source: string }): OptState {
  if (state.optedOut) return state;
  if (incoming.optedOut) return { optedOut: true, source: incoming.source };
  return state;
}
