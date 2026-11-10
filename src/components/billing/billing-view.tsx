"use client";

import { ArrowSquareOut, Lightning, Receipt, ShieldCheck, Wallet } from "@phosphor-icons/react/dist/ssr";

import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type BillingData = {
  on: boolean;
  testMode?: boolean;
  canManage: boolean;
  markup: number;
  plan: { id: string; name: string; priceCents: number; includedCents: number };
  packs: number[];
  autoRefillDefaults: { thresholdCents: number; amountCents: number; maxPerMonth: number };
  account: {
    balanceCents: number;
    planId: string | null;
    planStatus: string | null;
    nextResetAt: number | null;
    autoRefill: { enabled: boolean; thresholdCents: number; amountCents: number } | null;
    refreshedAt: number;
  } | null;
  spent30dCents: number;
  ledger: { id: string; source: string; ref: string; costCents: number; priceCents: number; at: number; synced: boolean }[];
};

const dollars = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const SOURCE_WORDS: Record<string, string> = { run: "Research session", followup: "Follow-up", intake: "Planning chat", file: "Reading a file", creative: "Creative image", page: "Reading a web page" };

export function BillingView({
  data,
  busy,
  notice,
  actions,
}: {
  data: BillingData;
  busy: string | null;
  notice: string;
  actions: { subscribe: () => void; topUp: (cents: number) => void; autoRefill: (on: boolean) => void; portal: () => void };
}) {
  const balance = data.account?.balanceCents ?? 0;
  const active = Boolean(data.account?.planId) && data.account?.planStatus !== "canceled";
  const refill = data.account?.autoRefill?.enabled ?? false;
  const low = data.on && balance <= data.autoRefillDefaults.thresholdCents;
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader eyebrow="Workspace" title="Billing" description={`Credits pay for the AI work your agents do. Each piece of work costs what it really cost Vistrial, times ${data.markup}. Nothing is charged until work runs.`} />

      {data.testMode ? (
        <Banner compact tone="brand" title="Test mode">
          Payments use Stripe test mode, so nothing real is charged. Use the card 4242 4242 4242 4242 with any future date and CVC.
        </Banner>
      ) : null}
      {!data.on ? (
        <Banner tone="neutral" title="Billing is not switched on for this deployment yet">
          Work runs freely here. Once billing is on, new work needs a credit balance.
        </Banner>
      ) : balance <= 0 ? (
        <Banner tone="critical" title="Your credit balance is empty" action={data.canManage ? <Button size="sm" onClick={() => actions.topUp(data.packs[1] ?? 2500)}>Add credits</Button> : undefined}>
          New sessions can&apos;t start until credits are added. Work already running finishes.
        </Banner>
      ) : low ? (
        <Banner tone="warning" title="Credits are running low">
          {refill ? `Auto-refill will add ${dollars(data.autoRefillDefaults.amountCents)} soon.` : "Add a pack or turn on auto-refill so work does not stop."}
        </Banner>
      ) : null}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel className="relative grid gap-4 overflow-hidden p-5 sm:p-6">
          <div aria-hidden className="absolute -top-16 -right-16 size-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet weight="duotone" aria-hidden className="size-5 text-primary" /> Credit balance
            </span>
            {active ? <StatusBadge label={`${data.plan.name} plan`} tone="good" className="[&_span]:normal-case" /> : <StatusBadge label="No plan yet" tone="neutral" className="[&_span]:normal-case" />}
          </div>
          <p className={cn("font-heading text-5xl tracking-tight tabular-nums", balance < 0 ? "text-destructive" : "text-foreground")}>
            {balance < 0 ? "-" : ""}$<NumberTicker value={Math.abs(balance) / 100} decimalPlaces={2} className={balance < 0 ? "text-destructive" : "text-foreground"} />
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="grid gap-0.5 rounded-xl border border-border bg-background/60 p-3">
              <dt className="text-xs text-muted-foreground">Spent, last 30 days</dt>
              <dd className="font-medium text-card-foreground tabular-nums">{dollars(data.spent30dCents)}</dd>
            </div>
            <div className="grid gap-0.5 rounded-xl border border-border bg-background/60 p-3">
              <dt className="text-xs text-muted-foreground">Plan credits renew</dt>
              <dd className="font-medium text-card-foreground">
                {data.account?.nextResetAt ? new Date(data.account.nextResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "With your plan"}
              </dd>
            </div>
          </dl>
          {data.canManage && active ? (
            <Button variant="outline" className="w-fit" disabled={!data.on || busy !== null} onClick={actions.portal}>
              <ArrowSquareOut weight="duotone" aria-hidden /> Cards, invoices and plan
            </Button>
          ) : null}
        </Panel>

        <Panel className="grid content-start gap-4 p-5 sm:p-6">
          <div className="grid gap-1">
            <p className="text-sm text-muted-foreground">{data.plan.name} plan</p>
            <p className="font-heading text-3xl text-foreground">
              {dollars(data.plan.priceCents).replace(".00", "")}
              <span className="text-base text-muted-foreground"> / month</span>
            </p>
            <p className="text-sm text-muted-foreground">Includes {dollars(data.plan.includedCents).replace(".00", "")} of credits every month. Top-ups never expire.</p>
          </div>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2"><ShieldCheck weight="duotone" aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> A Thorough research session is usually $2–$3.</li>
            <li className="flex gap-2"><ShieldCheck weight="duotone" aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> A follow-up question is a few cents.</li>
            <li className="flex gap-2"><ShieldCheck weight="duotone" aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> Every charge is listed below with what it really cost.</li>
          </ul>
          {data.canManage && !active ? (
            <Button disabled={!data.on || busy !== null} onClick={actions.subscribe}>
              {busy === "plan" ? "Opening checkout…" : `Start the ${data.plan.name} plan`}
            </Button>
          ) : null}
          {!data.canManage ? <p className="text-xs text-muted-foreground">The workspace Owner manages billing.</p> : null}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="grid content-start gap-3 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-heading text-base text-card-foreground">
            <Lightning weight="duotone" aria-hidden className="size-5 text-primary" /> Top up
          </h2>
          <p className="text-sm text-muted-foreground">Add credits any time. They&apos;re used after your plan&apos;s monthly credits.</p>
          <div className="grid grid-cols-3 gap-2">
            {data.packs.map((cents) => (
              <button
                key={cents}
                type="button"
                disabled={!data.canManage || !data.on || busy !== null}
                onClick={() => actions.topUp(cents)}
                className="grid gap-0.5 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="font-heading text-xl text-foreground">{dollars(cents).replace(".00", "")}</span>
                <span className="text-xs text-muted-foreground">{busy === `topup:${cents}` ? "Opening…" : "of credits"}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="grid content-start gap-3 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-heading text-base text-card-foreground">
            <Wallet weight="duotone" aria-hidden className="size-5 text-primary" /> Auto-refill
          </h2>
          <p className="text-sm text-muted-foreground">
            When the balance drops under {dollars(data.autoRefillDefaults.thresholdCents)}, add {dollars(data.autoRefillDefaults.amountCents)} from the card on file. At most {data.autoRefillDefaults.maxPerMonth} times a month.
          </p>
          <div className="flex items-center gap-3">
            <StatusBadge label={refill ? "On" : "Off"} tone={refill ? "good" : "neutral"} />
            {data.canManage ? (
              <Button size="sm" variant={refill ? "outline" : "default"} disabled={!data.on || busy !== null || !active} onClick={() => actions.autoRefill(!refill)}>
                {busy === "refill" ? "Saving…" : refill ? "Turn off" : "Turn on"}
              </Button>
            ) : null}
          </div>
          {!active && data.canManage ? <p className="text-xs text-muted-foreground">Start the plan first so there&apos;s a card on file.</p> : null}
        </Panel>
      </div>

      <Panel className="grid gap-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-base text-card-foreground">
          <Receipt weight="duotone" aria-hidden className="size-5 text-primary" /> Usage
        </h2>
        {data.ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No charges yet. Each session, follow-up and file read will be listed here with what it really cost.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">When</th>
                  <th className="py-2 font-medium">What</th>
                  <th className="py-2 text-right font-medium">AI cost</th>
                  <th className="py-2 text-right font-medium">Charged</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2 text-muted-foreground" suppressHydrationWarning>
                        {new Date(row.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td className="py-2 text-card-foreground">{SOURCE_WORDS[row.source] ?? row.source}</td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">{dollars(row.costCents)}</td>
                      <td className="py-2 text-right font-medium text-card-foreground tabular-nums">
                        {dollars(row.priceCents)}
                        {!row.synced && data.on ? <span className="ml-1 text-[10px] text-muted-foreground">sending</span> : null}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
