"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { parseAccessForm, type RequestKind } from "@/lib/access-requests/validate";
import { capturePublicRequest } from "@/lib/marketing/capture";
import { FORMS } from "@/lib/marketing/content";
import { requestIp, verifyTurnstile } from "@/lib/marketing/turnstile";

export type AccessFormState = {
  ok: boolean;
  message: string;
  errors: Partial<Record<string, string>>;
};

const initialErrors: AccessFormState["errors"] = {};

async function submit(kind: RequestKind, formData: FormData): Promise<AccessFormState> {
  const parsed = parseAccessForm(formData, kind);
  if (!parsed.ok) return { ok: false, message: parsed.message, errors: parsed.errors };
  if (parsed.value.honeypot) {
    redirect(kind === "custom" ? "/thanks?kind=custom" : "/thanks?kind=access");
  }
  const headerStore = await headers();
  const human = await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""), requestIp(headerStore));
  if (!human) return { ok: false, message: FORMS.errors.generic, errors: initialErrors };
  const saved = await capturePublicRequest({
    kind,
    email: parsed.value.email,
    name: parsed.value.fullName,
    detail: [
      parsed.value.businessName,
      parsed.value.need,
      parsed.value.problem,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (!saved.ok) return { ok: false, message: saved.message, errors: initialErrors };
  redirect(kind === "custom" ? "/thanks?kind=custom" : "/thanks?kind=access");
}

export async function submitPrivateAccess(_prev: AccessFormState, formData: FormData): Promise<AccessFormState> {
  return submit("private_access", formData);
}

export async function submitCustomContact(_prev: AccessFormState, formData: FormData): Promise<AccessFormState> {
  return submit("custom", formData);
}
