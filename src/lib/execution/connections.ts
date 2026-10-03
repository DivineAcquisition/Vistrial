import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/ghl/crypto";
import type { GhlDb } from "@/lib/ghl/tokens";
import { EXECUTION_KINDS, type ExecutionKind } from "@/lib/execution/kinds";
import type { ConnectionStatus, ExecutionConnectionView } from "@/lib/execution/types";

export type { ConnectionStatus, ExecutionConnectionView };

/** Server-only, for making a call. Decrypted tokens are never returned to a client. */
export type ExecutionConnection = ExecutionConnectionView & {
  secret: string | null;
  refresh: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
};

const VIEW_COLUMNS =
  "kind, status, account_label, external_account_id, destination_id, destination_label, last_error, last_verified_at";

type ViewRow = {
  kind: string;
  status: string;
  account_label: string | null;
  external_account_id: string | null;
  destination_id: string | null;
  destination_label: string | null;
  last_error: string | null;
  last_verified_at: string | null;
};

function toView(row: ViewRow): ExecutionConnectionView {
  return {
    kind: row.kind as ExecutionKind,
    status: row.status as ConnectionStatus,
    accountLabel: row.account_label,
    externalAccountId: row.external_account_id,
    destinationId: row.destination_id,
    destinationLabel: row.destination_label,
    lastError: row.last_error,
    lastVerifiedAt: row.last_verified_at,
  };
}

export async function loadConnectionViews(db: GhlDb, orgId: string): Promise<ExecutionConnectionView[]> {
  const { data } = await db.from("execution_connections").select(VIEW_COLUMNS).eq("org_id", orgId);
  const byKind = new Map((data ?? []).map((row) => [row.kind, toView(row)]));
  return EXECUTION_KINDS.map(
    (kind) =>
      byKind.get(kind) ?? {
        kind,
        status: "missing" as const,
        accountLabel: null,
        externalAccountId: null,
        destinationId: null,
        destinationLabel: null,
        lastError: null,
        lastVerifiedAt: null,
      }
  );
}

export async function loadConnection(
  db: GhlDb,
  orgId: string,
  kind: ExecutionKind
): Promise<ExecutionConnection | null> {
  const { data } = await db
    .from("execution_connections")
    .select(`${VIEW_COLUMNS}, secret_encrypted, refresh_encrypted, token_expires_at, metadata`)
    .eq("org_id", orgId)
    .eq("kind", kind)
    .maybeSingle();
  if (!data) return null;
  let secret: string | null = null;
  let refresh: string | null = null;
  try {
    secret = data.secret_encrypted ? decryptSecret(data.secret_encrypted) : null;
    refresh = data.refresh_encrypted ? decryptSecret(data.refresh_encrypted) : null;
  } catch {
    // An unreadable token is a broken connection, not a crash.
    return { ...toView({ ...data, status: "broken" }), secret: null, refresh: null, expiresAt: null, metadata: {} };
  }
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  return { ...toView(data), secret, refresh, expiresAt: data.token_expires_at, metadata };
}

export async function saveConnection(
  db: GhlDb,
  args: {
    orgId: string;
    kind: ExecutionKind;
    memberId: string;
    accountLabel: string | null;
    externalAccountId?: string | null;
    secret?: string | null;
    refresh?: string | null;
    expiresAt?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
    /** Reconnecting keeps no old destination: it was chosen against the old grant. */
    keepDestination?: boolean;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const existing = args.keepDestination
    ? (await db.from("execution_connections").select("destination_id, destination_label").eq("org_id", args.orgId).eq("kind", args.kind).maybeSingle()).data
    : null;
  const { error } = await db.from("execution_connections").upsert(
    {
      org_id: args.orgId,
      kind: args.kind,
      status: "active",
      account_label: args.accountLabel,
      external_account_id: args.externalAccountId ?? null,
      secret_encrypted: args.secret ? encryptSecret(args.secret) : null,
      refresh_encrypted: args.refresh ? encryptSecret(args.refresh) : null,
      token_expires_at: args.expiresAt ?? null,
      destination_id: existing?.destination_id ?? null,
      destination_label: existing?.destination_label ?? null,
      metadata: args.metadata ?? {},
      last_error: null,
      last_verified_at: now,
      connected_by_member_id: args.memberId,
      updated_at: now,
    },
    { onConflict: "org_id,kind" }
  );
  if (error) throw new Error("Could not save the connection.");
}

export async function saveDestination(
  db: GhlDb,
  orgId: string,
  kind: ExecutionKind,
  destination: { id: string; label: string }
): Promise<void> {
  const { error } = await db
    .from("execution_connections")
    .update({
      destination_id: destination.id,
      destination_label: destination.label,
      status: "active",
      last_error: null,
      last_verified_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("kind", kind)
    .neq("status", "inactive");
  if (error) throw new Error("Could not save that choice.");
}

/** A short rotating of the access token (Drive). */
export async function saveAccessToken(
  db: GhlDb,
  orgId: string,
  kind: ExecutionKind,
  token: { secret: string; expiresAt: string }
): Promise<void> {
  await db
    .from("execution_connections")
    .update({ secret_encrypted: encryptSecret(token.secret), token_expires_at: token.expiresAt })
    .eq("org_id", orgId)
    .eq("kind", kind)
    .neq("status", "inactive");
}

/** The message is written for a person: it is what the card shows. */
export async function markBroken(db: GhlDb, orgId: string, kind: ExecutionKind, plainMessage: string) {
  await db
    .from("execution_connections")
    .update({ status: "broken", last_error: plainMessage })
    .eq("org_id", orgId)
    .eq("kind", kind)
    .neq("status", "inactive");
}

export async function markHealthy(db: GhlDb, orgId: string, kind: ExecutionKind) {
  await db
    .from("execution_connections")
    .update({ status: "active", last_error: null, last_verified_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("kind", kind)
    .neq("status", "inactive");
}

/**
 * Halts every future write at once by dropping the tokens and the
 * destination. It never touches what was already posted or filed. The caller
 * revokes the grant at the provider afterwards, with the token read before.
 */
export async function clearConnection(db: GhlDb, orgId: string, kind: ExecutionKind): Promise<void> {
  const { error } = await db
    .from("execution_connections")
    .update({
      status: "inactive",
      secret_encrypted: null,
      refresh_encrypted: null,
      token_expires_at: null,
      destination_id: null,
      destination_label: null,
      account_label: null,
      external_account_id: null,
      metadata: {},
      last_error: null,
    })
    .eq("org_id", orgId)
    .eq("kind", kind);
  if (error) throw new Error("Could not disconnect.");
}
