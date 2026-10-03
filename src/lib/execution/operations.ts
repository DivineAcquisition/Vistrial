import "server-only";

import { authorizeExecution, type AuthorizationResult, type ExecutionAuthorization } from "@/lib/execution/authorize";
import { loadConnection, markBroken, type ExecutionConnection } from "@/lib/execution/connections";
import { discordPostMessage } from "@/lib/execution/discord";
import { assetFolderPath } from "@/lib/execution/drive-layout";
import { ProviderError, looksLikeSecret, plainErrorMessage } from "@/lib/execution/errors";
import {
  driveAccessToken,
  driveEnsureFolderPath,
  driveUploadFile,
  driveVerifyFolder,
  sanitizeSegment,
} from "@/lib/execution/google-drive";
import {
  EXECUTION_ACTION_TYPES,
  EXECUTION_OPERATION_FOR,
  EXECUTION_TITLES,
  type ExecutionKind,
} from "@/lib/execution/kinds";
import { messageToText, validateMessage, type StructuredMessage } from "@/lib/execution/message";
import { slackPostMessage } from "@/lib/execution/slack";
import { recordWrite } from "@/lib/execution/write-log";
import type { GhlDb } from "@/lib/ghl/tokens";

export type ExecutionResult =
  | { ok: true; writeId: string | null; externalRef: string }
  | { ok: false; error: string; blocked: boolean };

/**
 * The three operations the agent has here. Each is its own function with its
 * own inputs; there is no shared "send to a service" entry point to call with
 * a URL or a destination. The destination always comes from the connection
 * the client set up.
 */

type Prepared = {
  connection: ExecutionConnection;
  destinationId: string;
  destinationLabel: string;
};

async function prepare(
  db: GhlDb,
  orgId: string,
  kind: ExecutionKind
): Promise<{ ok: true; value: Prepared } | { ok: false; error: string }> {
  const title = EXECUTION_TITLES[kind];
  const connection = await loadConnection(db, orgId, kind);
  if (!connection || connection.status === "inactive" || connection.status === "missing") {
    return { ok: false, error: `${title} is not connected.` };
  }
  if (connection.status === "broken") {
    return { ok: false, error: connection.lastError ?? `${title} needs to be reconnected.` };
  }
  if (!connection.destinationId || !connection.destinationLabel) {
    return {
      ok: false,
      error: kind === "google_drive" ? "Choose a Drive folder first." : "Choose a channel first.",
    };
  }
  return {
    ok: true,
    value: { connection, destinationId: connection.destinationId, destinationLabel: connection.destinationLabel },
  };
}

async function execute(
  db: GhlDb,
  args: {
    orgId: string;
    kind: ExecutionKind;
    authorization: ExecutionAuthorization;
    /** What the log keeps. Also checked for anything shaped like a credential. */
    content: string;
    perform: (prepared: Prepared) => Promise<{ externalRef: string; logged?: string }>;
  }
): Promise<ExecutionResult> {
  const base = {
    orgId: args.orgId,
    kind: args.kind,
    authorizationKind: args.authorization.kind,
    approvalItemId: args.authorization.kind === "approval_item" ? args.authorization.approvalItemId : null,
    authorizedByMemberId:
      args.authorization.kind === "approval_item"
        ? args.authorization.approvedByMemberId
        : args.authorization.kind === "owner_test"
          ? args.authorization.memberId
          : null,
  } as const;

  const blocked = async (error: string, destination?: Prepared): Promise<ExecutionResult> => {
    await recordWrite(db, {
      ...base,
      status: "blocked",
      destinationId: destination?.destinationId ?? null,
      destinationLabel: destination?.destinationLabel ?? null,
      content: args.content,
      failureReason: error,
    });
    return { ok: false, error, blocked: true };
  };

  const prepared = await prepare(db, args.orgId, args.kind);
  if (!prepared.ok) return blocked(prepared.error);

  if (looksLikeSecret(args.content)) {
    return blocked("That looked like it contained a password or access key, so it was not sent.", prepared.value);
  }

  const authorized = await authorizeExecution(db, {
    orgId: args.orgId,
    kind: args.kind,
    authorization: args.authorization,
  });
  if (!authorized.ok) return blocked(authorized.reason, prepared.value);

  try {
    const done = await args.perform(prepared.value);
    const writeId = await recordWrite(db, {
      ...base,
      status: "sent",
      destinationId: prepared.value.destinationId,
      destinationLabel: prepared.value.destinationLabel,
      content: done.logged ?? args.content,
      externalRef: done.externalRef,
    });
    await recordActivity(db, args.orgId, args.kind, authorized);
    return { ok: true, writeId, externalRef: done.externalRef };
  } catch (error) {
    const message = plainErrorMessage(error, "Something went wrong. Nothing was sent.");
    if (error instanceof ProviderError && (error.code === "auth" || error.code === "destination")) {
      await markBroken(db, args.orgId, args.kind, message);
    }
    if (!(error instanceof ProviderError)) {
      // The error object is not logged: it can carry a request URL or header.
      console.error(JSON.stringify({ src: "vistrial", event: "execution.write_failed", kind: args.kind }));
    }
    await recordWrite(db, {
      ...base,
      status: "failed",
      destinationId: prepared.value.destinationId,
      destinationLabel: prepared.value.destinationLabel,
      content: args.content,
      failureReason: message,
    });
    return { ok: false, error: message, blocked: false };
  }
}

/**
 * Feeds the Home "handled while you were away" log. A test an owner pressed
 * is not an action the agent took, so it is left out.
 */
async function recordActivity(
  db: GhlDb,
  orgId: string,
  kind: ExecutionKind,
  authorized: Extract<AuthorizationResult, { ok: true }>
): Promise<void> {
  if (authorized.kind === "owner_test") return;
  let approvedByName: string | null = null;
  if (authorized.memberId) {
    const { data } = await db.from("org_members").select("display_name").eq("id", authorized.memberId).eq("org_id", orgId).maybeSingle();
    approvedByName = data?.display_name ?? null;
  }
  await db.from("agent_events").insert({
    org_id: orgId,
    actor: "vistrial",
    action_taken: EXECUTION_ACTION_TYPES[kind],
    input: { operation: EXECUTION_OPERATION_FOR[kind] },
    output: {
      runMode: authorized.kind === "auto_run" ? "auto_run" : "approved",
      approvedByMemberId: authorized.memberId,
      approvedByName,
      count: 1,
      leadIds: [],
    },
  });
}

function invalid(error: string): ExecutionResult {
  return { ok: false, error, blocked: true };
}

/** slack.post_message: one structured message to the channel the client chose. */
export async function postSlackMessage(
  db: GhlDb,
  args: { orgId: string; message: StructuredMessage; authorization: ExecutionAuthorization }
): Promise<ExecutionResult> {
  const problem = validateMessage(args.message);
  if (problem) return invalid(problem);
  return execute(db, {
    orgId: args.orgId,
    kind: "slack",
    authorization: args.authorization,
    content: messageToText(args.message),
    perform: async ({ connection, destinationId }) => {
      if (!connection.secret) throw new ProviderError("Slack needs to be reconnected.", "auth");
      const posted = await slackPostMessage(connection.secret, destinationId, args.message);
      return { externalRef: posted.ts };
    },
  });
}

/** discord.post_message: one structured message to the channel the client chose. */
export async function postDiscordMessage(
  db: GhlDb,
  args: { orgId: string; message: StructuredMessage; authorization: ExecutionAuthorization }
): Promise<ExecutionResult> {
  const problem = validateMessage(args.message);
  if (problem) return invalid(problem);
  return execute(db, {
    orgId: args.orgId,
    kind: "discord",
    authorization: args.authorization,
    content: messageToText(args.message),
    perform: async ({ destinationId }) => {
      const posted = await discordPostMessage(destinationId, args.message);
      return { externalRef: posted.id };
    },
  });
}

/**
 * drive.store_asset: files one asset inside the client's root folder, in the
 * subfolder the layout names. The only folder ids ever used descend from the
 * stored root; there is no parameter to point somewhere else.
 */
export async function storeDriveAsset(
  db: GhlDb,
  args: {
    orgId: string;
    assetKind: string;
    fileName: string;
    content: string | Uint8Array;
    mimeType?: string;
    authorization: ExecutionAuthorization;
    now?: Date;
  }
): Promise<ExecutionResult> {
  if (!args.assetKind.trim() || !args.fileName.trim()) return invalid("An asset needs a kind and a file name.");
  const path = assetFolderPath(sanitizeSegment(args.assetKind), args.now);
  const where = `${path.join(" / ")} / ${sanitizeSegment(args.fileName)}`;
  const textual = typeof args.content === "string" ? args.content : "";
  return execute(db, {
    orgId: args.orgId,
    kind: "google_drive",
    authorization: args.authorization,
    content: textual ? `${where}\n${textual.slice(0, 500)}` : where,
    perform: async ({ destinationId }) => {
      const token = await driveAccessToken(db, args.orgId);
      // The root can be trashed or un-shared after it was chosen.
      const root = await driveVerifyFolder(token, destinationId);
      const folderId = await driveEnsureFolderPath(token, root.id, path);
      const file = await driveUploadFile(token, folderId, args.fileName, args.content, args.mimeType);
      return { externalRef: file.id, logged: `${root.name} / ${where}` };
    },
  });
}

/**
 * The "Send a test" button on a connection card. An owner or admin pressing
 * it is the authorisation, and it writes a real message or file to the real
 * destination, so what the team sees is what the agent will produce.
 */
export async function sendConnectionTest(
  db: GhlDb,
  args: { orgId: string; kind: ExecutionKind; memberId: string }
): Promise<ExecutionResult> {
  const authorization = { kind: "owner_test", memberId: args.memberId } as const;
  if (args.kind === "slack") {
    return postSlackMessage(db, { orgId: args.orgId, authorization, message: TEST_MESSAGE });
  }
  if (args.kind === "discord") {
    return postDiscordMessage(db, { orgId: args.orgId, authorization, message: TEST_MESSAGE });
  }
  return storeDriveAsset(db, {
    orgId: args.orgId,
    authorization,
    assetKind: "Connection checks",
    fileName: "Vistrial connection check.txt",
    content: `${TEST_MESSAGE.title}\n${TEST_MESSAGE.summary ?? ""}\n`,
  });
}

const TEST_MESSAGE: StructuredMessage = {
  title: "Vistrial is connected",
  summary: "This is a test from Settings. Approved updates from Vistrial will appear here.",
  footer: "Sent by Vistrial",
};
