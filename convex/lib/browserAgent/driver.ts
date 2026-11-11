/**
 * The dry-run driver. It proposes the steps of a few practice tasks on a made-up CRM and "performs" them by
 * doing nothing at all: no browser is opened, no site is contacted, nothing is changed anywhere. It exists so
 * the approval surface, the rules and the audit trail can be built and tried before any real account access.
 *
 * A real driver would have the same two jobs: propose the next step from what is on screen, and perform a
 * step only after the rules and a person have allowed it. See docs/rebuild/browser-with-approval.md.
 */
import type { ProposedStep } from "./policy";

export type Driver = {
  name: "dryRun";
  /** The next step toward the goal after `done` steps, or null when the task is finished. */
  next(goalKey: string, done: number): ProposedStep | null;
};

const BASE = "https://app.practice-crm.vistrial.example";

export const DRY_RUN_GOALS: readonly { key: string; label: string; summary: string; steps: ProposedStep[] }[] = [
  {
    key: "headline",
    label: "Update the headline on a draft funnel page, then publish it",
    summary: "Two things are read, three changes each wait for your approval, and publishing waits for a separate one.",
    steps: [
      { verb: "open", target: "the Funnels list", url: `${BASE}/funnels`, kind: "read", why: "To find the Booked Calendar funnel." },
      { verb: "read", target: "the Booked Calendar landing page's current headline and button", url: `${BASE}/funnels/booked-calendar/landing`, kind: "read", why: "To see what the page says now, before changing anything." },
      { verb: "click", target: "the Edit draft button", url: `${BASE}/funnels/booked-calendar/landing`, kind: "change", why: "Opens the draft for editing. The live page is not touched." },
      { verb: "type", target: "the Headline field", url: `${BASE}/funnels/booked-calendar/landing/edit`, value: "Fill your calendar with sales calls from people who can afford you", kind: "change", why: "The headline from the brief you approved: the outcome in the reader's words." },
      { verb: "click", target: "the Save draft button", url: `${BASE}/funnels/booked-calendar/landing/edit`, kind: "change", why: "Saves the draft. It stays a draft." },
      { verb: "click", target: "the Publish button", url: `${BASE}/funnels/booked-calendar/landing/edit`, kind: "change", why: "Makes the new headline live for visitors." },
    ],
  },
  {
    key: "pipeline",
    label: "Move new applicants to Qualified and tidy the list",
    summary: "The list is read, one move waits for approval, and the two risky steps the task would like to take each need a separate one.",
    steps: [
      { verb: "open", target: "the Pipeline board", url: `${BASE}/pipeline`, kind: "read", why: "To see who applied this week." },
      { verb: "read", target: "the New applicants column", url: `${BASE}/pipeline`, kind: "read", why: "To find applicants over the revenue threshold." },
      { verb: "select", target: "the Stage menu on Dana Whitfield's card", url: `${BASE}/pipeline/leads/dana-whitfield`, value: "Qualified", kind: "change", why: "She stated $18K a month, above your $10K threshold." },
      // A driver may under-state a step. The rules read the words: this one sends a message to a person.
      { verb: "click", target: "the Send follow-up email button", url: `${BASE}/pipeline/leads/dana-whitfield`, kind: "read", why: "To tell her a call slot is open." },
      { verb: "click", target: "the Delete lead button on a duplicate card", url: `${BASE}/pipeline/leads/dana-whitfield-2`, kind: "change", why: "The same person applied twice." },
    ],
  },
  {
    key: "wander",
    label: "Check the funnel's payment settings (a task that tries to leave the site)",
    summary: "Shows a hard stop: the task tries to follow a link to another site and is blocked.",
    steps: [
      { verb: "open", target: "the Funnel settings page", url: `${BASE}/funnels/booked-calendar/settings`, kind: "read", why: "To see which payment provider is linked." },
      { verb: "open", target: "the payment provider's dashboard", url: "https://dashboard.payments.example.com/account", kind: "read", why: "To read the payout schedule." },
    ],
  },
];

export const dryRunDriver: Driver = {
  name: "dryRun",
  next(goalKey, done) {
    return DRY_RUN_GOALS.find((goal) => goal.key === goalKey)?.steps[done] ?? null;
  },
};

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

/**
 * A drawn stand-in for the screenshot a real driver would take: a browser frame with the address, the
 * element the step is about outlined, and what would be typed. It says "Dry run" on its face.
 */
export function drawStep(step: { verb: string; target: string; url: string; value?: string; kind: string }, index: number): string {
  const accent = step.kind === "restricted" ? "#f87171" : step.kind === "change" ? "#9a88fc" : "#52d6a4";
  const value = step.value ? `<rect x="120" y="318" width="560" height="44" rx="8" fill="#ffffff" stroke="${accent}" stroke-width="2"/><text x="136" y="346" font-family="sans-serif" font-size="15" fill="#1e1940">${escape(step.value.slice(0, 62))}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#f7f7fa"/><rect width="800" height="48" fill="#e6e6ec"/><circle cx="24" cy="24" r="6" fill="#c8c8d0"/><circle cx="44" cy="24" r="6" fill="#c8c8d0"/><circle cx="64" cy="24" r="6" fill="#c8c8d0"/><rect x="92" y="12" width="620" height="24" rx="12" fill="#ffffff"/><text x="106" y="29" font-family="monospace" font-size="12" fill="#52525b">${escape(step.url.slice(0, 80))}</text><rect x="40" y="76" width="720" height="380" rx="12" fill="#ffffff" stroke="#e6e6ec"/><text x="64" y="112" font-family="sans-serif" font-size="13" fill="#6b6b76">Step ${index + 1} · ${escape(step.verb)}</text><rect x="120" y="200" width="560" height="76" rx="10" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="3" stroke-dasharray="${step.kind === "read" ? "0" : "8 6"}"/><text x="400" y="244" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#1e1940">${escape(step.target.slice(0, 56))}</text>${value}<text x="400" y="432" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#6b6b76">Dry run. Nothing was opened or changed. This drawing stands in for a screenshot.</text></svg>`;
}
