/**
 * What a chat is told about where it was started (step 3, the side panel). Two things, both named and typed
 * by the page, never read from the page's text:
 *   - `page`: which screen the person was on, one of CHAT_PAGES;
 *   - `context`: the one record that was open (a report or draft, an offer, a task, a research session),
 *     checked to be this organization's and one the person may see.
 * The client a chat is about is separate and fixed when it starts (`intakes.clientId`).
 */
export const CHAT_PAGES = {
  home: "Home",
  tasks: "Tasks",
  briefing: "Briefing",
  research: "Research",
  offers: "Offers",
  diagnostics: "Diagnostics",
  creative: "Creative",
  pages: "Pages",
  brands: "Brands",
  chats: "Chats",
  evidence: "Evidence",
  knowledge: "Knowledge",
  settings: "Settings",
  asset: "A report or draft",
  run: "A run",
} as const;

export type ChatPage = keyof typeof CHAT_PAGES;

export function isChatPage(value: string | undefined | null): value is ChatPage {
  return Boolean(value && Object.prototype.hasOwnProperty.call(CHAT_PAGES, value));
}

export const CONTEXT_KINDS = ["asset", "offer", "task", "project"] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

/** How an attached record reads in a sentence: "this report", "this task". */
export const CONTEXT_NOUN: Record<ContextKind, string> = {
  asset: "earlier result",
  offer: "offer of theirs",
  task: "task from the Tasks board",
  project: "research session",
};
