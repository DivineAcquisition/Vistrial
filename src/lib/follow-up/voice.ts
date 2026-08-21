import { MAX_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import type { FollowUpChannel, VoiceExample, VoiceProfile } from "@/lib/follow-up/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseVoiceExample(value: unknown): VoiceExample | null {
  const row = asRecord(value);
  if (!row) return null;
  const body = asString(row.body);
  const channel = asString(row.channel);
  if (!body) return null;
  if (channel !== "sms" && channel !== "email") return null;
  return {
    body,
    channel: channel as FollowUpChannel,
    addedAt: asString(row.addedAt) ?? asString(row.added_at) ?? new Date().toISOString(),
    sourceDraftId: asString(row.sourceDraftId) ?? asString(row.source_draft_id),
  };
}

export function parseVoiceExamples(value: unknown): VoiceExample[] {
  if (!Array.isArray(value)) return [];
  const examples: VoiceExample[] = [];
  for (const item of value) {
    const parsed = parseVoiceExample(item);
    if (parsed) examples.push(parsed);
    if (examples.length >= MAX_VOICE_EXAMPLES) break;
  }
  return examples;
}

export function examplesToJson(examples: VoiceExample[]) {
  return examples.map((item) => ({
    body: item.body,
    channel: item.channel,
    addedAt: item.addedAt,
    sourceDraftId: item.sourceDraftId ?? null,
  }));
}

export function parseVoiceProfile(row: {
  formality: VoiceProfile["formality"];
  use_contractions: boolean;
  use_greeting: boolean;
  use_signoff: boolean;
  greeting_text: string | null;
  signoff_text: string | null;
  sms_max_chars: number;
  email_max_chars: number;
  emoji_usage: VoiceProfile["emojiUsage"];
  banned_words: string[] | null;
  examples: unknown;
}): VoiceProfile {
  return {
    formality: row.formality,
    useContractions: row.use_contractions,
    useGreeting: row.use_greeting,
    useSignoff: row.use_signoff,
    greetingText: row.greeting_text,
    signoffText: row.signoff_text,
    smsMaxChars: row.sms_max_chars,
    emailMaxChars: row.email_max_chars,
    emojiUsage: row.emoji_usage,
    bannedWords: row.banned_words ?? [],
    examples: parseVoiceExamples(row.examples),
  };
}
