/**
 * Turns what a person pasted or uploaded into plain transcript text. Subtitle files (.vtt, .srt) lose
 * their cue numbers and timestamps; the words and speaker names stay. Anything that is not text is refused.
 */

/** Convex documents hold 1 MB; a long call is well under this. */
export const MAX_TRANSCRIPT_BYTES = 600_000;
export const MIN_TRANSCRIPT_CHARS = 40;

export type TranscriptRefusal = "empty" | "too_short" | "too_large" | "not_text";

const TIMING = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}.*$/;

function looksLikeSubtitles(text: string) {
  return /^﻿?WEBVTT/.test(text) || text.split("\n", 40).some((line) => TIMING.test(line));
}

function stripSubtitles(text: string) {
  const out: string[] = [];
  let inNote = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      inNote = false;
      continue;
    }
    if (inNote) continue;
    if (/^﻿?WEBVTT/.test(line) || /^(Kind|Language):/i.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) {
      inNote = true;
      continue;
    }
    if (TIMING.test(line) || /^\d+$/.test(line)) continue;
    // <v Dana Ortiz>Hello</v> becomes "Dana Ortiz: Hello"; other tags go.
    const spoken = line.replace(/<v(?:\.[^\s>]+)*\s+([^>]+)>/g, "$1: ").replace(/<[^>]+>/g, "").trim();
    // Subtitle files repeat a line across cues; keep it once.
    if (spoken && spoken !== out[out.length - 1]) out.push(spoken);
  }
  return out.join("\n");
}

export function cleanTranscript(input: string): { ok: true; text: string; words: number } | { ok: false; code: TranscriptRefusal } {
  if (new TextEncoder().encode(input).length > MAX_TRANSCRIPT_BYTES * 2) return { ok: false, code: "too_large" };
  // A zero byte, or many control characters, means a binary file (audio, video, a document) was sent as text.
  const control = (input.match(/[\u0000-\u0008\u000E-\u001F�]/g) ?? []).length;
  if (input.includes("\u0000") || control > Math.max(8, input.length / 200)) return { ok: false, code: "not_text" };
  const normal = input.replace(/\r\n?/g, "\n");
  const text = (looksLikeSubtitles(normal) ? stripSubtitles(normal) : normal)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return { ok: false, code: "empty" };
  if (text.length < MIN_TRANSCRIPT_CHARS) return { ok: false, code: "too_short" };
  if (new TextEncoder().encode(text).length > MAX_TRANSCRIPT_BYTES) return { ok: false, code: "too_large" };
  return { ok: true, text, words: text.split(/\s+/).filter(Boolean).length };
}

export const TRANSCRIPT_REFUSAL_WORDS: Record<TranscriptRefusal, string> = {
  empty: "There is no text in that transcript.",
  too_short: "That is too short to be a call transcript.",
  too_large: "That transcript is too long. Split the call into parts, or remove the timestamps.",
  not_text: "That is not a text file. Vistrial takes transcript text only, never audio or video.",
};
