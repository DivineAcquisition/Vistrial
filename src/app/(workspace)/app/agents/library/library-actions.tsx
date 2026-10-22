"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { LibraryDetail } from "@/app/(workspace)/app/agents/library/page";
import { recordAgentInterestAction, setAgentEnabledAction } from "@/app/(workspace)/app/agents/roster-actions";
import { PauseAction } from "@/components/agents/agent-roster";
import { useAgentSummary } from "@/components/agents/summary-context";
import { GlyphMark } from "@/components/live/agent-identity";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { SETUP_STEPS, type AgentSummaryRow } from "@/lib/agents/summary";
import type { WorkspaceRole } from "@/lib/auth/types";

const STATUS: Record<AgentSummaryRow["state"], string> = {
  on: "On",
  needs_setup: "Needs setup",
  pending: "Waiting for confirmation",
  available: "Available",
  off: "Off",
  locked: "Locked",
  not_available: "Coming soon",
};

const WORKS_ON: Record<string, string> = {
  lead: "leads",
  case_file: "case files",
  call: "calls",
  booking: "bookings",
  task: "tasks",
  customer: "customers",
  account: "accounts",
  renewal: "renewals",
};

function statusLabel(row: AgentSummaryRow): string {
  if (row.state === "not_available" && row.availability === "beta") return "Beta";
  return STATUS[row.state];
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The plain summary an Owner reads before an agent starts on their data. */
function Summary({ row, detail }: { row: AgentSummaryRow; detail: LibraryDetail | null }) {
  if (!detail) return <p className="text-sm text-muted-foreground">{row.description}</p>;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{detail.longDescription}</p>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs font-medium text-card-foreground">On its own</dt>
          <dd className="text-muted-foreground">{list(detail.autonomy.automatic) || "Nothing on its own."}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-card-foreground">Only suggests</dt>
          <dd className="text-muted-foreground">{list(detail.autonomy.suggests) || "Nothing."}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-card-foreground">Never without your approval</dt>
          <dd className="text-muted-foreground">{list(detail.autonomy.never)}</dd>
        </div>
        {detail.worksOn.length ? (
          <div>
            <dt className="text-xs font-medium text-card-foreground">What it uses</dt>
            <dd className="text-muted-foreground">Your {list(detail.worksOn.map((kind) => WORKS_ON[kind] ?? kind))}.</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function Needs({ row, detail }: { row: AgentSummaryRow; detail: LibraryDetail | null }) {
  const steps = (detail?.prerequisites ?? []).map((key) => SETUP_STEPS[key]?.label).filter(Boolean) as string[];
  return (
    <p className="text-xs text-muted-foreground">
      {row.state === "locked" ? row.lockedReason : "Included on your plan."}
      {steps.length ? ` Needs: ${list(steps.map((step) => step.charAt(0).toLowerCase() + step.slice(1)))}.` : ""}
    </p>
  );
}

function InterestButton({ agentId, kind, done, label }: { agentId: string; kind: "notify_me" | "request_access" | "early_access"; done: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(done);
  const [error, setError] = useState<string | null>(null);
  if (sent) return <p className="text-xs text-success">Sent. The Vistrial team will be in touch.</p>;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await recordAgentInterestAction({ agentId }, kind);
            if (result.ok) setSent(true);
            else setError(result.error);
          })
        }
      >
        {label}
      </Button>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </>
  );
}

export function NotifyAreaButton({ areaId, done }: { areaId: string; done: boolean }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(done);
  if (sent) return <p className="text-xs text-success">We will let you know.</p>;
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await recordAgentInterestAction({ areaId }, "notify_me");
          if (result.ok) setSent(true);
        })
      }
    >
      Notify me
    </Button>
  );
}

function TurnOn({ row, detail, role }: { row: AgentSummaryRow; detail: LibraryDetail | null; role: WorkspaceRole }) {
  const { refresh } = useAgentSummary();
  const [error, setError] = useState<string | null>(null);
  const staff = role === "service_team" || role === "platform_admin";
  const confirming = row.state === "pending";
  const title = confirming ? `Confirm ${row.name}?` : `Turn on ${row.name}?`;
  return (
    <>
      <ConfirmDialog
        trigger={<Button size="sm">{confirming ? "Review and confirm" : "Turn on"}</Button>}
        title={title}
        description={
          staff
            ? `${row.name} acts on this business's data, so the Owner confirms before it starts. Until then it does nothing.`
            : "Read what it will do. You can pause or turn it off at any time."
        }
        confirmLabel={confirming ? "Confirm" : "Turn on"}
        confirmVariant="default"
        onConfirm={async () => {
          setError(null);
          const result = await setAgentEnabledAction(row.id, true);
          if (!result.ok) setError(result.error);
          refresh();
        }}
      >
        <Summary row={row} detail={detail} />
      </ConfirmDialog>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </>
  );
}

function TurnOff({ row }: { row: AgentSummaryRow }) {
  const { refresh } = useAgentSummary();
  const [withdraw, setWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = row.waiting.total;
  return (
    <>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost">
            Turn off
          </Button>
        }
        title={`Turn off ${row.name}?`}
        description={`${row.name} stops working in this workspace. Its history and everything it made are kept, and you can turn it on again from here.`}
        confirmLabel="Turn off"
        onConfirm={async () => {
          setError(null);
          const result = await setAgentEnabledAction(row.id, false, withdraw);
          if (!result.ok) setError(result.error);
          refresh();
        }}
      >
        {open > 0 ? (
          <label className="flex items-start gap-2 pb-2 text-sm text-muted-foreground">
            <Checkbox checked={withdraw} onCheckedChange={(value) => setWithdraw(value === true)} />
            <span>
              Withdraw its {open} open request{open === 1 ? "" : "s"} waiting for approval. Leave this unticked to keep them for review.
            </span>
          </label>
        ) : null}
      </ConfirmDialog>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </>
  );
}

function Action({ row, detail, role }: { row: AgentSummaryRow; detail: LibraryDetail | null; role: WorkspaceRole }) {
  const staff = role === "service_team" || role === "platform_admin";
  switch (row.state) {
    case "on":
    case "needs_setup":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {row.state === "needs_setup" && row.setupStep ? (
            <Button size="sm" render={<Link href={row.setupStep.href} />}>
              {row.setupStep.label}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" render={<Link href={`/app/agents/${row.id}`} />}>
            Open page
          </Button>
          {row.state === "on" ? <PauseAction row={row} /> : null}
          <TurnOff row={row} />
        </div>
      );
    case "pending":
      return role === "owner" ? <TurnOn row={row} detail={detail} role={role} /> : <p className="text-xs text-muted-foreground">Waiting for the Owner to confirm.</p>;
    case "available":
    case "off":
      return <TurnOn row={row} detail={detail} role={role} />;
    case "locked":
      return <InterestButton agentId={row.id} kind="request_access" done={row.interest.includes("request_access")} label="Request access" />;
    case "not_available":
      return row.availability === "beta" ? (
        <InterestButton agentId={row.id} kind="early_access" done={row.interest.includes("early_access")} label="Request early access" />
      ) : staff ? null : (
        <InterestButton agentId={row.id} kind="notify_me" done={row.interest.includes("notify_me")} label="Notify me" />
      );
  }
}

export function LibraryCard({
  row,
  detail,
  readOnly,
  role,
}: {
  row: AgentSummaryRow;
  detail: LibraryDetail | null;
  readOnly: boolean;
  role: WorkspaceRole;
}) {
  return (
    <div id={row.id} className="scroll-mt-24">
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <GlyphMark glyph={row.glyph} accent={row.accent} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-card-foreground">{row.name}</h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{statusLabel(row)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{row.sublabel}</p>
        </div>
      </div>
      <p className="text-sm text-card-foreground">{row.description}</p>
      <p className="text-xs text-muted-foreground">{row.promise}</p>
      <Needs row={row} detail={detail} />
      {row.state === "pending" && row.requestedBy ? <p className="text-xs text-warning">Turned on by {row.requestedBy}. It does nothing until the Owner confirms.</p> : null}
      {readOnly ? null : <Action row={row} detail={detail} role={role} />}
    </Panel>
    </div>
  );
}
