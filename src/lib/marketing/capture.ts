import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { CONTACT_EMAIL } from "@/lib/constants";
import { api } from "../../../convex/_generated/api";

export const UNSAVED_MESSAGE = `We could not save that just now. Try again in a moment, or email ${CONTACT_EMAIL}.`;

export type PublicRequestKind = "private_access" | "custom" | "security_review" | "vulnerability" | "lead_data_note";

export type PublicRequest = {
  kind: PublicRequestKind;
  email: string;
  name: string;
  business?: string;
  /** Short text shown in the admin list. */
  detail: string;
  /** Every answer, in form order, as the team should read it. Blank values are dropped. */
  fields?: { label: string; value: string | null | undefined }[];
  pagePath?: string;
};

/**
 * Saves a public form post to Convex. Convex then emails the team, so a mail
 * problem never loses a submission. Needs NEXT_PUBLIC_CONVEX_URL and the
 * PUBLIC_FORM_SECRET shared with the Convex deployment.
 */
export async function capturePublicRequest(input: PublicRequest): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const secret = process.env.PUBLIC_FORM_SECRET?.trim();
  if (!url || !secret) {
    console.error("Form capture is not configured: set NEXT_PUBLIC_CONVEX_URL and PUBLIC_FORM_SECRET.");
    return { ok: false, message: UNSAVED_MESSAGE };
  }
  const fields = (input.fields ?? [])
    .map((field) => ({ label: field.label, value: (field.value ?? "").trim() }))
    .filter((field) => field.value !== "");
  try {
    const client = new ConvexHttpClient(url);
    await client.mutation(api.publicSubmissions.submit, {
      secret,
      kind: input.kind,
      name: input.name,
      email: input.email,
      business: input.business || undefined,
      summary: input.detail,
      fields,
      pagePath: input.pagePath || undefined,
    });
    return { ok: true };
  } catch (error) {
    console.error("Form capture failed.", error instanceof Error ? error.message : error);
    return { ok: false, message: UNSAVED_MESSAGE };
  }
}
