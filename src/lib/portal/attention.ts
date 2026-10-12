import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { canSeeResults } from "@/lib/auth/portal-access";
import { currentNumber } from "@/lib/metrics/format";
import { loadSummary, portalDb } from "@/lib/metrics/load";

/**
 * What needs a person right now, in the order it should be handled. Every
 * count is read as the person, so nobody is told about something they cannot
 * open. An item with nothing waiting is left out rather than shown as zero.
 */

export type AttentionTone = "danger" | "warning" | "info";

export type AttentionItem = {
  id: string;
  label: string;
  detail: string;
  count: number | null;
  href: string;
  tone: AttentionTone;
};

export type AttentionState = { items: AttentionItem[]; loadedAt: string };

const NOW_METRICS = ["drafts_waiting", "missed_now", "at_risk_now", "alerts_open_now", "scribe_review"] as const;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type OnboardingStep = { key: string; label: string; state: string; action?: { label: string; href: string } | null };

export async function loadAttention(ctx: AuthContext): Promise<AttentionState> {
  const loadedAt = new Date().toISOString();
  if (!canSeeResults(ctx)) return { items: [], loadedAt };
  const db = await portalDb();
  const nowRange = { from: loadedAt, to: loadedAt };
  const owner = ctx.workspaceRole === "owner" || ctx.isStaff;

  const [summary, crm, billing, onboarding, help] = await Promise.all([
    loadSummary({ orgId: ctx.org.id, metrics: [...NOW_METRICS], range: nowRange, db }).catch(() => null),
    db.from("ghl_connections").select("status").eq("org_id", ctx.org.id),
    owner
      ? db.from("workspace_billing").select("payment_failed_at, status").eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    owner
      ? db.from("workspace_onboarding_status").select("steps, live").eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("help_requests")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.org.id)
      .eq("created_by_user_id", ctx.user.id)
      .eq("status", "answered"),
  ]);

  const items: AttentionItem[] = [];
  const count = (metric: (typeof NOW_METRICS)[number]) => (summary ? currentNumber(metric, summary[metric]) : null);

  const missed = count("missed_now");
  if (missed) {
    items.push({
      id: "missed",
      label: plural(missed, "lead missed its deadline", "leads missed their deadline"),
      detail: "Nobody has replied yet. Reply from your CRM as soon as you can.",
      count: missed,
      href: "/app/results/leads?metric=missed_now",
      tone: "danger",
    });
  }

  const drafts = count("drafts_waiting");
  if (drafts) {
    items.push({
      id: "drafts",
      label: plural(drafts, "draft is waiting for approval", "drafts are waiting for approval"),
      detail: "Nothing goes out until someone approves it.",
      count: drafts,
      href: "#home-queue",
      tone: "warning",
    });
  }

  const atRisk = count("at_risk_now");
  if (atRisk) {
    items.push({
      id: "at-risk",
      label: plural(atRisk, "lead is close to its deadline", "leads are close to their deadline"),
      detail: "A reply now keeps them on time.",
      count: atRisk,
      href: "/app/results/leads?metric=at_risk_now",
      tone: "warning",
    });
  }

  const alerts = count("alerts_open_now");
  if (alerts) {
    items.push({
      id: "alerts",
      label: plural(alerts, "alert nobody has picked up", "alerts nobody has picked up"),
      detail: "Sentry raised these and nobody has acknowledged them.",
      count: alerts,
      href: "/app/results/leads?metric=alerts_open_now",
      tone: "warning",
    });
  }

  const review = count("scribe_review");
  if (review) {
    items.push({
      id: "review",
      label: plural(review, "case file needs a check", "case files need a check"),
      detail: "Scribe was not sure about these and set them aside.",
      count: review,
      href: "/app/results/leads?metric=scribe_review",
      tone: "info",
    });
  }

  const statuses = ((crm.data ?? []) as Array<{ status: string }>).map((row) => row.status);
  if (statuses.includes("broken") && !statuses.includes("active")) {
    items.push({
      id: "crm",
      label: "Your CRM connection stopped working",
      detail: "New leads are not coming in until it is reconnected.",
      count: null,
      href: "/app/settings/connections",
      tone: "danger",
    });
  }

  const bill = billing.data as { payment_failed_at: string | null; status: string | null } | null;
  if (bill?.payment_failed_at) {
    items.push({
      id: "billing",
      label: "Your last payment did not go through",
      detail: "Nothing has been switched off. Update your payment details when you can.",
      count: null,
      href: "/app/settings/billing",
      tone: "danger",
    });
  }

  const status = onboarding.data as { steps: OnboardingStep[] | null; live: boolean } | null;
  const waiting = (status?.steps ?? []).filter((step) => step.state === "waiting_on_customer");
  if (status && !status.live && waiting.length) {
    items.push({
      id: "onboarding",
      label: plural(waiting.length, "setup step is waiting on you", "setup steps are waiting on you"),
      detail: waiting.map((step) => step.label).join(", "),
      count: waiting.length,
      href: "/app/onboarding",
      tone: "info",
    });
  }

  const answered = help.count ?? 0;
  if (answered) {
    items.push({
      id: "help",
      label: plural(answered, "reply from your Vistrial team", "replies from your Vistrial team"),
      detail: "Your team answered a question you asked.",
      count: answered,
      href: "/app/help",
      tone: "info",
    });
  }

  return { items, loadedAt };
}
