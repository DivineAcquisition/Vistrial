/**
 * The business's own note taker and HighLevel call recordings, as Dealmaker reads them (build step 11b;
 * docs/rebuild/integrations-setup.md, section 8). Pure: request shapes and defensive reading of the answers.
 * Only the words said are kept, never audio, video, attendee emails or share links.
 */

export const FIREFLIES_API = "https://api.fireflies.ai/graphql";

/** The GraphQL each step sends. Fields are only those Vistrial keeps. */
export const FIREFLIES_QUERY = {
  me: "query { user { user_id name } }",
  recent: "query Recent($limit: Int) { transcripts(limit: $limit) { id title date duration } }",
  one: "query One($id: String!) { transcript(id: $id) { id title date sentences { speaker_name text } } }",
} as const;

export const NOTE_LIMITS = { recent: 20, title: 120 } as const;

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Fireflies gives dates as milliseconds since 1970, sometimes as a string. */
function msOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function firefliesUser(body: unknown): { id: string; name: string } | null {
  const user = asRow(asRow(asRow(body)?.data)?.user);
  const id = text(user?.user_id, 80);
  return id ? { id, name: text(user?.name, 80) || "Fireflies account" } : null;
}

export type NoteTakerCall = { id: string; title: string; at: number | null; minutes: number | null };

export function firefliesRecent(body: unknown): NoteTakerCall[] {
  const rows = asRow(asRow(body)?.data)?.transcripts;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const row = asRow(raw);
    const id = text(row?.id, 80);
    if (!id) return [];
    const duration = typeof row?.duration === "number" && row.duration > 0 ? Math.round(row.duration) : null;
    return [{ id, title: text(row?.title, NOTE_LIMITS.title) || "A call", at: msOf(row?.date), minutes: duration }];
  });
}

export type Spoken = { speaker: string; words: string };

export function firefliesTranscript(body: unknown): { title: string; at: number | null; lines: Spoken[] } | null {
  const row = asRow(asRow(asRow(body)?.data)?.transcript);
  if (!row || !Array.isArray(row.sentences)) return null;
  const lines = row.sentences.flatMap((raw) => {
    const sentence = asRow(raw);
    const words = text(sentence?.text, 2000);
    return words ? [{ speaker: text(sentence?.speaker_name, 60) || "Speaker", words }] : [];
  });
  return { title: text(row.title, NOTE_LIMITS.title) || "A call", at: msOf(row.date), lines };
}

/** Lines as a transcript: consecutive sentences by one speaker joined, "Name: words" per turn. */
export function transcriptText(lines: Spoken[]): string {
  const turns: Spoken[] = [];
  for (const line of lines) {
    const last = turns.at(-1);
    if (last && last.speaker === line.speaker) last.words = `${last.words} ${line.words}`;
    else turns.push({ ...line });
  }
  return turns.map((turn) => `${turn.speaker}: ${turn.words}`).join("\n");
}

/** A day as YYYY-MM-DD, for the transcript's call date. */
export function dayOf(at: number | null): string | undefined {
  return at ? new Date(at).toISOString().slice(0, 10) : undefined;
}

/** HighLevel's address for one call's recording, by the message it belongs to. */
export function recordingPath(messageId: string, locationId: string) {
  return `/conversations/messages/${encodeURIComponent(messageId)}/locations/${encodeURIComponent(locationId)}/recording`;
}

/** Deepgram's answer: the transcript with speaker turns when it gives them, else the plain transcript. */
export function deepgramLines(body: unknown): Spoken[] {
  const channels = asRow(asRow(body)?.results)?.channels;
  const first = Array.isArray(channels) ? asRow(channels[0]) : null;
  const best = Array.isArray(first?.alternatives) ? asRow(first.alternatives[0]) : null;
  const paragraphs = asRow(best?.paragraphs)?.paragraphs;
  if (Array.isArray(paragraphs) && paragraphs.length) {
    return paragraphs.flatMap((raw) => {
      const para = asRow(raw);
      const words = (Array.isArray(para?.sentences) ? para.sentences : [])
        .map((sentence) => text(asRow(sentence)?.text, 2000))
        .filter(Boolean)
        .join(" ");
      const speaker = typeof para?.speaker === "number" ? `Speaker ${para.speaker + 1}` : "Speaker";
      return words ? [{ speaker, words }] : [];
    });
  }
  const plain = text(best?.transcript, 200_000);
  return plain ? [{ speaker: "Call", words: plain }] : [];
}
