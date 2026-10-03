import { EXECUTION_TITLES } from "@/lib/execution/kinds";
import type { ExecutionConnectionView } from "@/lib/execution/types";

export type CardStep = "unavailable" | "connect" | "choose" | "ready" | "reconnect";

export type CardState = {
  step: CardStep;
  tone: "neutral" | "good" | "warning";
  title: string;
  detail: string;
};

/**
 * The words on a connection card. A broken connection is described the way
 * the CRM card describes one: what is wrong in plain terms and what to press,
 * never an error code or a response body.
 */
export function describeConnection(view: ExecutionConnectionView, configured: boolean): CardState {
  const name = EXECUTION_TITLES[view.kind];
  const connected = view.status === "active" || view.status === "broken";

  if (!connected && !configured) {
    return {
      step: "unavailable",
      tone: "neutral",
      title: "Not available yet",
      detail: `${name} has not been set up on this deployment, so it cannot be connected yet.`,
    };
  }
  if (!connected) {
    return { step: "connect", tone: "neutral", title: "Not connected", detail: "" };
  }
  if (view.status === "broken") {
    return {
      step: "reconnect",
      tone: "warning",
      title: "Needs attention",
      detail: view.lastError ?? `${name} stopped accepting posts. Reconnect it to keep going.`,
    };
  }
  const where = view.accountLabel ? ` to ${view.accountLabel}` : "";
  if (!view.destinationId) {
    return {
      step: "choose",
      tone: "warning",
      title: `Connected${where}`,
      detail: view.kind === "google_drive" ? "Choose the folder Vistrial files into." : "Choose the channel Vistrial posts to.",
    };
  }
  return {
    step: "ready",
    tone: "good",
    title: view.kind === "google_drive" ? `Filing into ${view.destinationLabel}` : `Posting to ${view.destinationLabel}`,
    detail: view.accountLabel ?? "",
  };
}

/** Flash text after OAuth. Fixed strings keyed by a code, so a URL cannot put words on the page. */
export const EXECUTION_FLASH_ERRORS: Record<string, string> = {
  oauth_denied: "The authorization was cancelled. Nothing was connected.",
  oauth_invalid: "That connection attempt was not valid. Start again from this page.",
  oauth_failed: "The connection could not be completed. Start again from this page.",
  too_broad: "The service offered more access than Vistrial asks for, so it was not connected.",
};
