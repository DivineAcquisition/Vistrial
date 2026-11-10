"use client";

import { BrowserAccessView, type BrowserOverview, type BrowserTrail } from "@/components/connections/browser-access";
import { drawStep } from "../../../../convex/lib/browserAgent/driver";

import { StoryTheme } from "../story-theme";
import fixture from "./fixture.json";

const noop = async () => undefined;

/**
 * The fixture is what the real queries returned for the dry-run tasks (convex/browserAccess.test.ts writes
 * it). The pictures are drawn here the way the server draws them, since a story has no file storage.
 */
const data = fixture as unknown as { overview: BrowserOverview; done: BrowserTrail; change: BrowserTrail; restricted: BrowserTrail; blocked: BrowserTrail };

const pictured = (trail: BrowserTrail): BrowserTrail => ({
  ...trail,
  steps: trail.steps.map((step) => ({ ...step, screenshot: `data:image/svg+xml;utf8,${encodeURIComponent(drawStep({ ...step, value: step.value ?? undefined }, step.index))}` })),
});

/** Browser access with fixture data: the step waiting for approval, a restricted step, and the audit trail. */
export function BrowserAccessStory({ state, theme }: { state: string; theme: string }) {
  const role = state === "manager" ? "manager" : state === "rep" ? "rep" : "owner";
  const base = state === "restricted" || state === "manager" ? data.restricted : state === "done" ? data.done : state === "blocked" ? data.blocked : data.change;
  // A restricted step is the Owner's alone: a Manager sees it and cannot approve it.
  const trail = role === "manager" ? { ...base, steps: base.steps.map((step) => (step.kind === "restricted" ? { ...step, canDecide: false } : step)) } : base;
  const session = data.overview.sessions[0];
  const sessions = state === "none" ? [] : state === "signin" ? [{ ...session, state: "pendingSignIn" as const, signedInAt: null, expiresAt: null }] : data.overview.sessions;
  const tasks = state === "none" || state === "signin" ? [] : data.overview.tasks.filter((task) => task.id === trail.task.id || task.status !== "waitingApproval").map((task) => (task.id === trail.task.id ? trail.task : task));
  const overview: BrowserOverview = { ...data.overview, role, sessions, tasks };
  return (
    <>
      <StoryTheme theme={theme} />
      <main className="min-h-dvh bg-background px-4 py-6 sm:px-8">
        <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
          <BrowserAccessView overview={overview} trail={state === "none" || state === "signin" || role === "rep" ? null : pictured(trail)} onOpenTask={() => undefined} actions={{ connect: noop, completeSignIn: noop, revoke: noop, startTask: noop, decide: noop, stop: noop }} />
        </div>
      </main>
    </>
  );
}
