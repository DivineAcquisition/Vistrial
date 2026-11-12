import type { Feed, Post } from "@/components/briefing/briefing-feed";
import type { Id } from "../../../../convex/_generated/dataModel";

export const NOW = Date.UTC(2026, 10, 12, 15);
const HOUR = 3600_000;
const DAY = 24 * HOUR;

let count = 0;
function item(input: Partial<Post> & Pick<Post, "kind" | "kindLabel" | "title" | "at">): Post {
  count += 1;
  return { id: `b${count}` as Id<"briefingItems">, agentSlug: "growth-architect", client: null, body: null, unread: false, href: null, sources: [], credits: null, approval: null, draft: null, ...input };
}

type Approval = NonNullable<Post["approval"]>;
function approval(input: Partial<Approval> & Pick<Approval, "kind" | "kindLabel" | "summary">, canDecide: boolean): Approval {
  count += 1;
  return { id: `ap${count}` as Id<"approvals">, credits: null, agentSlug: "growth-architect", clientId: null, status: "waiting", requestedAt: NOW, decidedAt: null, href: null, needsReason: false, ownerOnly: false, confirm: null, canDecide, ...input };
}

const WEEKLY = `This week at Northlight Growth and its four clients.

What moved
• Aster Coaching: 31 booked calls in October, up from 24 in September (Aster results file). New clients fell from 6 to 4.
• Harbor Dental Group: no new results file since October 14, so nothing can be said about this month.
• Northlight's own enquiries: 9, 7, then 4 over the last three weeks (calendar bookings).

What finished
• Market report: executive coaching programs (approved November 6).
• Page teardown: danareyes.example.

What was measured
• Reminder texts before Aster's sales calls: it helped. Bookings 24 to 31 (+29.2%).
• Ledgerline's entry price at $2,500: no clear change.

Proposed for next week: three tasks, on the Tasks board. Two have an expected return from your own data; one says "Not enough data" because no results file covers the site yet.`;

/** Northlight Growth's Briefing on an ordinary Thursday. */
export function storyFeed(state: string, kind: string | null): Feed {
  count = 0;
  const decides = state !== "member" && state !== "viewer";
  const owner = state !== "admin" && decides;
  const all: Post[] = [
    item({
      kind: "approval",
      kindLabel: "Approval",
      title: "Proposed: Test a two-call close for Aster's leadership program",
      body: "Aster's booked calls rose in October but fewer became clients. Three competing programs now split the sale into a fit call and a decision call.",
      client: "Aster Coaching",
      at: NOW - 40 * 60_000,
      unread: true,
      href: "/app/tasks",
      approval: approval({ kind: "task", kindLabel: "A task an agent wants to run", summary: "Test a two-call close" }, decides),
    }),
    item({
      kind: "draft",
      kindLabel: "Draft to review",
      title: "Draft to review: Offer analysis for Northlight's retainer",
      at: NOW - 2 * HOUR,
      unread: true,
      href: "/app/assets/a9",
      draft: {
        text: "Your retainer is priced in line with five of the eight agencies compared, but it is the only one with a three month minimum and no trial. Two of your six lost proposals this quarter named the minimum. The analysis suggests testing a 30 day paid pilot at the same monthly price, with the retainer starting automatically unless the client stops it.",
        version: 1,
        needsReview: false,
      },
      approval: approval({ kind: "publish", kindLabel: "Going public", summary: "Offer analysis", needsReason: true }, decides),
    }),
    item({
      kind: "approval",
      kindLabel: "Approval",
      title: "Approve a change in Practice CRM (dry run)",
      body: "click the Publish button. Makes the new headline live for visitors.",
      agentSlug: "growth-architect",
      at: NOW - 3 * HOUR,
      unread: true,
      href: "/app/connections/browser",
      approval: approval({ kind: "accountChange", kindLabel: "A change in a connected account", summary: "Publish", ownerOnly: true, confirm: { word: "PUBLISH", why: "It publishes something where others can see it." } }, owner),
    }),
    item({
      kind: "alert",
      kindLabel: "Alert",
      title: "Results dropped: Harbor bookings",
      body: "Conversions went from 64 to 47 (-27%) between the last two results files.",
      client: "Harbor Dental Group",
      agentSlug: null,
      at: NOW - 5 * HOUR,
      unread: true,
      href: "/app/connections/results",
    }),
    item({ kind: "finished", kindLabel: "Finished work", title: "Finished: Page teardown: danareyes.example", client: "Dana Reyes", at: NOW - 9 * HOUR, unread: true, href: "/app/assets/a7" }),
    item({ kind: "weeklyReport", kindLabel: "Weekly growth report", title: "Weekly growth report: November 2 to 8", body: WEEKLY, at: NOW - 3 * DAY, href: "/app/tasks", credits: 84 }),
    item({ kind: "alert", kindLabel: "Alert", title: "A check-in is due", body: "You said you would try this: Send a pre-call video before Aster's sales calls. Say what happened, and the next proposal builds on it.", client: "Aster Coaching", agentSlug: null, at: NOW - 1 * DAY, href: "/app/tasks" }),
    item({ kind: "alert", kindLabel: "Alert", title: "Meta ads needs reconnecting", body: "Results from Meta have stopped updating. An Owner or Admin can reconnect it in Settings, Data.", agentSlug: null, at: NOW - 2 * DAY, href: "/app/settings?section=data" }),
    item({
      kind: "trend",
      kindLabel: "Industry trend",
      title: "Sample post: lead forms that ask a qualifying question first are being reported in some ad accounts",
      body: "Two industry write-ups this week describe the option appearing in lead ads for some accounts. For an agency running lead ads for coaches, this may lower lead volume and raise the share that books. Nothing here has been tested on your accounts.",
      at: NOW - 4 * DAY,
      credits: 36,
      sources: [
        { title: "Example Marketing Weekly: lead form changes", url: "https://example.com/weekly" },
        { title: "Example Ads Journal: what a qualifying question means", url: "https://example.com/journal" },
      ],
    }),
    item({
      kind: "draft",
      kindLabel: "Draft to review",
      title: "Draft to review: Market report: executive coaching programs",
      client: "Aster Coaching",
      at: NOW - 6 * DAY,
      href: "/app/assets/a3",
      approval: approval({ kind: "publish", kindLabel: "Going public", summary: "Market report", status: "approved", decidedAt: NOW - 6 * DAY + HOUR, needsReason: true }, false),
    }),
  ];
  const visible = state === "member" || state === "viewer" ? all.filter((row) => !row.client || row.client === "Aster Coaching" || row.client === "Dana Reyes") : all;
  const counts = { approval: 0, draft: 0, weeklyReport: 0, finished: 0, alert: 0, trend: 0 };
  for (const row of visible) counts[row.kind] += 1;
  const items = state === "empty" ? [] : state === "trends-off" ? [] : visible.filter((row) => !kind || row.kind === kind);
  if (state === "empty" || state === "trends-off") return { items, counts: state === "empty" ? { approval: 0, draft: 0, weeklyReport: 0, finished: 0, alert: 0, trend: 0 } : { ...counts, trend: 0 }, agents: [], unread: 0, total: state === "empty" ? 0 : visible.length - 1 };
  return { items, counts, agents: ["growth-architect"], unread: visible.filter((row) => row.unread).length, total: visible.length };
}
