import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { CONTACT_EMAIL } from "@/lib/constants";

export const UNSAVED_MESSAGE = `We could not save that yet. Email ${CONTACT_EMAIL} and we will pick it up.`;

export async function capturePublicRequest(input: {
  kind: string;
  email: string;
  name: string;
  detail: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) return { ok: false, message: UNSAVED_MESSAGE };
  try {
    const client = new ConvexHttpClient(url);
    await client.mutation(api.marketing.capture, input);
    return { ok: true };
  } catch {
    return { ok: false, message: UNSAVED_MESSAGE };
  }
}
