/**
 * What the Objection Playbook reads and works out in code, what it asks the model for, and the defensive reader
 * for the model's answer. In the app this is "Dealmaker · objection playbook". docs/rebuild/dealmaker.md, 0.8, 4.5.
 *
 * The counts, the buyer's words and what worked come from code (lib/dealmaker/objections.ts). The model writes one
 * talk track per objection heard, built only on the Offer folder: an untested hypothesis until it is used on a call.
 */

export const SKILL_SLUG = "objection-playbook";
export const AGENT_SLUG = "sales-conversion";

export const PHASE = { read: "obRead", write: "write", check: "obCheck", revise: "obRevise", recheck: "obRecheck", save: "save" } as const;

export const NOT_ENOUGH_DATA = "Not enough data";

export const TRACK_LIMITS = {
  /** Objections written for, most heard first. */
  objections: 12,
  /** Quotes and answers shown to the model per objection. */
  quotes: 3,
  /** Offer folder items shown to the model. */
  offerItems: 30,
  offerBody: 400,
  trackWords: 90,
  /** Approved lessons from the Playbook. */
  lessons: 12,
} as const;

/** One objection as the model sees it: the code's figures, the buyer's words and what our side said on calls later won. */
export type TrackObjection = {
  id: string;
  /** The Playbook item's own id, kept out of the prompt. */
  itemId: string;
  title: string;
  tag: string | null;
  heard: number;
  quotes: string[];
  worked: string[];
  workedWords: string;
};

/** An Offer folder item a talk track may stand on. */
export type OfferRef = { id: string; itemId: string; kind: string; title: string; body: string };

export type TrackRecord = {
  playbookId: string;
  projectId: string;
  calls: number;
  objections: TrackObjection[];
  offer: OfferRef[];
  voice: string | null;
  lessons: string[];
  missing: string[];
  /** Source refs saved for the calls the figures come from and the Offer folder. */
  refs: Record<string, string>;
};

export type Track = { objectionId: string; track: string; offerIds: string[] };
export type Tracks = { tracks: Track[] };

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

const str = { type: "string" };

export const TRACK_SCHEMA = {
  type: "object",
  properties: {
    tracks: {
      type: "array",
      items: {
        type: "object",
        properties: { objectionId: str, track: str, offerIds: { type: "array", items: str } },
        required: ["objectionId", "track", "offerIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["tracks"],
  additionalProperties: false,
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** The model's answer, read defensively: a field it got wrong is dropped or emptied, never trusted. */
export function readTracks(value: unknown): Tracks | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rows = (value as { tracks?: unknown }).tracks;
  if (!Array.isArray(rows)) return null;
  return {
    tracks: rows.slice(0, TRACK_LIMITS.objections + 4).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const offerIds = Array.isArray(item.offerIds) ? item.offerIds.map((id) => text(id, 10)).filter(Boolean).slice(0, 6) : [];
      return [{ objectionId: text(item.objectionId, 10), track: text(item.track, 1200), offerIds }];
    }),
  };
}
