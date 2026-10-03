import type { ExecutionKind } from "@/lib/execution/kinds";

export type ConnectionStatus = "active" | "broken" | "inactive";

/** What a screen may know about a connection. No token, ever. */
export type ExecutionConnectionView = {
  kind: ExecutionKind;
  status: ConnectionStatus | "missing";
  accountLabel: string | null;
  externalAccountId: string | null;
  destinationId: string | null;
  destinationLabel: string | null;
  lastError: string | null;
  lastVerifiedAt: string | null;
};
