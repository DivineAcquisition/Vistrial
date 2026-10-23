import "server-only";

import { CONTACT_EMAIL } from "@/lib/constants";

export const UNSAVED_MESSAGE = `We could not save that yet. Email ${CONTACT_EMAIL} and we will pick it up.`;

/** Step 1 does not store public form posts. Sign-in and workspaces live in Convex. */
export async function capturePublicRequest(_input: {
  kind: string;
  email: string;
  name: string;
  detail: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  return { ok: false, message: UNSAVED_MESSAGE };
}
