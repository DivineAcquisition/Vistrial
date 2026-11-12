/**
 * Which screen a person is on, and which record is open, as the side chat panel is told. Worked out from the
 * address only: a named page key and a record's id, never the page's text. The server checks the record
 * again when a message is sent (convex/agentChat.ts).
 */
import type { ChatPage, ContextKind } from "../../../convex/lib/chatContext";

export type OpenRecord = { kind: ContextKind; id: string; title?: string };

const WORK_TABS: Record<string, ChatPage> = { research: "research", offers: "offers", diagnostics: "diagnostics", creative: "creative", pages: "pages", brands: "brands", chat: "chats" };
const TOP: Record<string, ChatPage> = { tasks: "tasks", briefing: "briefing", research: "research", evidence: "evidence", knowledge: "knowledge", settings: "settings", chats: "chats" };
const ID = /^[\w-]{6,64}$/;

export function chatPageOf(pathname: string): { page: ChatPage | null; record: OpenRecord | null } {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts[0] !== "app") return { page: null, record: null };
  if (parts.length === 1) return { page: "home", record: null };
  if (parts[1] === "assets") return { page: "asset", record: parts[2] && ID.test(parts[2]) ? { kind: "asset", id: parts[2] } : null };
  if (parts[1] === "runs") return { page: "run", record: null };
  if (parts[1] === "agents" && parts[3] === "work") {
    const page = WORK_TABS[parts[4] ?? ""] ?? null;
    // A research or diagnosis session is a research project, opened by its id.
    const session = (parts[4] === "research" || parts[4] === "diagnostics") && parts[5] && ID.test(parts[5]) ? parts[5] : null;
    return { page, record: session ? { kind: "project", id: session } : null };
  }
  return { page: TOP[parts[1]] ?? null, record: null };
}

/** How an open record reads on its chip when the page gave no title. */
export const RECORD_WORDS: Record<ContextKind, string> = { asset: "The report or draft that is open", offer: "The offer that is open", task: "A task", project: "The session that is open" };
