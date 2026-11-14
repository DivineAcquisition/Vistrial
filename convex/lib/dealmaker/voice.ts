/**
 * Voice notes (docs/rebuild/dealmaker.md, step 14 and decision 3): a cloned voice counts as an artificial
 * voice under US calling law, so a voice note is only ever an audio attachment to a text or email, never a
 * voicemail drop; it goes only to leads under the consent tags; a person approves every one with the typed
 * SEND; and each voice is cloned only from its owner's own recorded consent. Pure: the server and the screens
 * read the same words and limits.
 */

export const VOICE_LIMITS = {
  /** What a voice note says: about forty seconds of speech. */
  script: 600,
  /** The consent recording, which is also the sample the voice is cloned from. */
  sampleSecondsMin: 30,
  sampleSecondsMax: 180,
  sampleBytes: 10_000_000,
  speakerName: 80,
} as const;

/** What the speaker reads aloud at the start of the recording, word for word. */
export function consentStatement(speakerName: string, business: string) {
  return (
    `My name is ${speakerName}. I agree that Vistrial may make a copy of my voice for ${business}, ` +
    "and use it only for voice notes to leads that a person at the business approves one by one. " +
    "I can have it deleted at any time."
  );
}

/** A passage to read after the statement, so the sample is long enough to clone from. */
export const SAMPLE_PASSAGE =
  "Thanks for getting in touch. I wanted to send you a quick note in my own voice. " +
  "We work with businesses like yours every week, and the first step is always a short call to see whether we are a good fit. " +
  "If now is not the right time, that is completely fine. Just reply and let me know what suits you, and I will take it from there.";

export const VOICE_TEXT = {
  notSetUp: "Voice notes are not set up yet.",
  noVoice: "Record your voice first: an Owner records the consent statement in Comms.",
  cloning: "Your voice is being prepared.",
  failed: "Your voice could not be prepared. Record it again, or try again later.",
  notMade: "Make the voice note and listen to it before sending it on.",
  making: "The voice note is being made.",
  tooLong: `A voice note is at most ${VOICE_LIMITS.script} characters, about forty seconds.`,
  nameMismatch: "Type the speaker's name exactly as they said it in the recording.",
  badRecording: "That recording could not be used. Record it again in the browser.",
  tooShort: `Record at least ${VOICE_LIMITS.sampleSecondsMin} seconds: the statement, then the passage.`,
  ownerOnly: "Only an Owner can record or remove the voice.",
  everyOne: "Every voice note waits for a person to approve it with SEND.",
  notAChannel: "Voice notes are not among the channels Dealmaker may draft for. Add them in the Playbook.",
  noConsentTags: "Voice notes go only to leads under your consent tags. Name them in the Playbook first.",
} as const;

/** Why a voice or a voice note did not work, in words. Codes come from ElevenLabs' answers or our checks. */
export const VOICE_FAIL_WORDS: Record<string, string> = {
  not_set_up: VOICE_TEXT.notSetUp,
  file_missing: "The recording is gone. Record it again.",
  unreachable: "ElevenLabs could not be reached. Try again later.",
  no_voice: VOICE_TEXT.noVoice,
  empty: "ElevenLabs sent back no audio. Try again.",
};

export function voiceFailWords(code: string | undefined) {
  if (!code) return VOICE_TEXT.failed;
  if (VOICE_FAIL_WORDS[code]) return VOICE_FAIL_WORDS[code];
  if (code.startsWith("elevenlabs_")) return `ElevenLabs refused it (${code.slice("elevenlabs_".length)}). Try again later.`;
  return VOICE_TEXT.failed;
}

/** Names match when they read the same, ignoring case and spacing. */
export function sameName(a: string, b: string) {
  const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}
