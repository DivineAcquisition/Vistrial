"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { homeForSession } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/session";

const DEFAULT_DESTINATION = "/attention";

/** One message for every failure. Anything more tells an attacker which email
 * addresses have accounts. */
const GENERIC_FAILURE = "Invalid email or password.";

const credentialsSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export type SignInState = { error: string | null };

/** Only same-origin, absolute-path destinations. `//host` is a protocol-relative
 * URL and would let a crafted login link bounce the admin off-site. */
function safeDestination(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_DESTINATION;
  return next;
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: GENERIC_FAILURE };

  const requested = safeDestination(formData.get("next"));
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: GENERIC_FAILURE };

  // Prefer the role-appropriate home. A portal member who was sent to an admin
  // `next` still lands in the portal; an admin keeps a deep link when it is
  // safe.
  const home = await homeForSession();
  if (home === "/portal") redirect("/portal");
  if (home === "/login") {
    await supabase.auth.signOut();
    return { error: "This account no longer has access." };
  }

  redirect(requested === DEFAULT_DESTINATION ? home : requested);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
