function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function pickString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const found = asString(record[key]);
    if (found) return found;
  }
  return null;
}

export function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!record) return null;
  return asRecord(record[key]);
}

export function asIso(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function asSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  const raw = asString(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

export function collectEmails(value: unknown): string[] {
  const found = new Set<string>();

  function walk(node: unknown, depth: number) {
    if (depth > 6 || node == null) return;
    if (typeof node === "string") {
      const match = node.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
      if (match) {
        for (const email of match) found.add(email.toLowerCase());
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node === "object") {
      const record = node as Record<string, unknown>;
      const email = pickString(record, ["email", "emailAddress", "email_address"]);
      if (email) found.add(email.toLowerCase());
      for (const nestedValue of Object.values(record)) walk(nestedValue, depth + 1);
    }
  }

  walk(value, 0);
  return [...found];
}

export function flattenTranscript(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const lines: string[] = [];
    for (const item of value) {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed) lines.push(trimmed);
        continue;
      }
      const record = asRecord(item);
      if (!record) continue;
      if (record.file_type || record.download_url || record.play_url || record.file_size) continue;
      const speaker = pickString(record, ["speaker", "speaker_name", "speakerName", "displayName", "name"]);
      const text =
        pickString(record, ["text", "content", "sentence", "utterance", "words"]) ??
        flattenTranscript(record.sentences ?? record.words);
      if (!text) continue;
      lines.push(speaker ? `${speaker}: ${text}` : text);
    }
    const joined = lines.join("\n").trim();
    return joined ? joined : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  return (
    pickString(record, ["transcript", "raw_transcript", "text", "content", "plain_text", "plaintext"]) ??
    flattenTranscript(record.sentences ?? record.utterances ?? record.paragraphs ?? record.entries)
  );
}

export function asJsonRecord(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {};
}

export function payloadWithoutAudio(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => payloadWithoutAudio(item));
  }
  if (!payload || typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (/audio|recording_file|download_url|play_url|\bmp3\b|\bmp4\b|\bwav\b|\bm4a\b/i.test(key)) continue;
    out[key] = payloadWithoutAudio(value);
  }
  return out;
}
