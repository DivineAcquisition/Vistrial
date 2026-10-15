"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { notifyStaffOfAbuse, savePublicRequest, verifyTurnstile } from "@/lib/access-requests/submit";
import { parseAccessForm, type RequestKind } from "@/lib/access-requests/validate";
import { FORMS } from "@/lib/marketing/content";
import { requestIp } from "@/lib/ops/rate-limit";

export type AccessFormState = {
  ok: boolean;
  message: string;
  errors: Partial<Record<string, string>>;
};

const initialErrors: AccessFormState["errors"] = {};

async function submit(kind: RequestKind, formData: FormData): Promise<AccessFormState> {
  const parsed = parseAccessForm(formData, kind);
  if (!parsed.ok) return { ok: false, message: parsed.message, errors: parsed.errors };
  const headerStore = await headers();
  const ip = requestIp(headerStore);
  const token = String(formData.get("cf-turnstile-response") ?? "");
  const human = await verifyTurnstile(token, ip);
  if (!human) return { ok: false, message: FORMS.errors.generic, errors: initialErrors };
  const saved = await savePublicRequest(parsed.value, ip);
  if (!saved.ok) {
    await notifyStaffOfAbuse();
    return { ok: false, message: saved.message, errors: initialErrors };
  }
  redirect(kind === "custom" ? "/thanks?kind=custom" : "/thanks?kind=access");
}

export async function submitPrivateAccess(_prev: AccessFormState, formData: FormData): Promise<AccessFormState> {
  return submit("private_access", formData);
}

export async function submitCustomContact(_prev: AccessFormState, formData: FormData): Promise<AccessFormState> {
  return submit("custom", formData);
}
