import { randomBytes } from "node:crypto";

import type { LedgerDb } from "@/lib/supabase/ledger";

/**
 * Supabase Auth allows one identity per address, but a single human email may
 * legitimately hold both a Divine Acquisition team account and a client portal
 * account. The contact address stays in `email` — invitations, notices, and the
 * sign-in forms all use it. When Auth has already given that address to the
 * other population, we mint a tagged alias for the Auth identity and remember
 * it in `auth_email`. Sign-in translates the typed contact address into the
 * alias, so nobody ever sees or types one.
 */

export type Population = "team" | "portal";

const TAG: Record<Population, string> = {
  team: "vt-team",
  portal: "vt-portal",
};

/** RFC 5321 caps the local part at 64 octets. */
const MAX_LOCAL_PART = 64;

/** The address Supabase Auth knows this person by. */
export function authAddress(row: {
  email: string;
  auth_email?: string | null;
}): string {
  return row.auth_email ?? row.email;
}

/** `dana@example.com` → `dana+vt-team-3f9c1a@example.com`. */
export function mintAuthAlias(email: string, population: Population): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    throw new Error("Cannot build an authentication alias for that address.");
  }

  const domain = email.slice(at + 1);
  const suffix = `+${TAG[population]}-${randomBytes(3).toString("hex")}`;
  const local = email.slice(0, at).slice(0, MAX_LOCAL_PART - suffix.length);

  return `${local}${suffix}@${domain}`.toLowerCase();
}

/** True when Auth refused because the address is already spoken for. */
export function isAddressTaken(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "email_exists" || code === "user_already_exists") return true;
  const message = (error as { message?: string }).message ?? "";
  return /already|exists|registered/i.test(message);
}

export type CreatedIdentity = {
  userId: string;
  /** Null when the contact address was free and became the Auth address. */
  authEmail: string | null;
};

/**
 * Creates the Auth identity for one person, falling back to a tagged alias when
 * the other population already holds the contact address. The two rows stay
 * unlinked: separate tables, separate identities, separate passwords.
 */
export async function createAuthIdentity(
  db: LedgerDb,
  input: {
    email: string;
    password: string;
    population: Population;
    appMetadata?: Record<string, unknown>;
    userMetadata?: Record<string, unknown>;
  }
): Promise<CreatedIdentity | { error: string }> {
  const attempts = [
    input.email,
    ...Array.from({ length: 4 }, () =>
      mintAuthAlias(input.email, input.population)
    ),
  ];

  let lastError: unknown = null;

  for (const address of attempts) {
    const { data, error } = await db.auth.admin.createUser({
      email: address,
      password: input.password,
      email_confirm: true,
      app_metadata: { population: input.population, ...input.appMetadata },
      user_metadata: input.userMetadata ?? {},
    });

    if (!error && data.user) {
      return {
        userId: data.user.id,
        authEmail: address === input.email ? null : address,
      };
    }

    lastError = error;
    if (!isAddressTaken(error)) break;
  }

  const message =
    lastError && typeof lastError === "object" && "message" in lastError
      ? String((lastError as { message?: string }).message)
      : null;

  return {
    error: message ?? "Could not create the account.",
  };
}
