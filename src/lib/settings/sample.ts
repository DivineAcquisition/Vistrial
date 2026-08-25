import type { Json } from "@/types/database";

export type VoiceSamplePreview = {
  leadName: string;
  body: string;
  generatedAt: string;
};

export function parseVoiceSamplePreview(value: Json | null | undefined): VoiceSamplePreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const leadName = typeof row.leadName === "string" ? row.leadName.trim() : "";
  const body = typeof row.body === "string" ? row.body.trim() : "";
  const generatedAt = typeof row.generatedAt === "string" ? row.generatedAt : "";
  if (!leadName || !body) return null;
  return { leadName, body, generatedAt };
}

export function voiceSampleToJson(sample: VoiceSamplePreview): Json {
  return {
    leadName: sample.leadName,
    body: sample.body,
    generatedAt: sample.generatedAt,
  };
}
