"use client";

import { CheckIcon, ChevronDownIcon, CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type AgentCardStatus = "waiting" | "working" | "done" | "failed" | "neutral";

const STATUS_LABEL: Record<AgentCardStatus, string> = {
  waiting: "Waiting for your OK",
  working: "Working on it",
  done: "Done",
  failed: "Needs another try",
  neutral: "Noted",
};

const STATUS_VARIANT: Record<AgentCardStatus, "info" | "secondary" | "success" | "error" | "outline"> = {
  waiting: "info",
  working: "secondary",
  done: "success",
  failed: "error",
  neutral: "outline",
};

export function AgentCard({
  title,
  status = "neutral",
  statusLabel,
  children,
  actions,
  className,
}: {
  title: string;
  status?: AgentCardStatus;
  statusLabel?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-medium text-card-foreground">{title}</h3>
        <Badge variant={STATUS_VARIANT[status]} size="sm">
          {statusLabel ?? STATUS_LABEL[status]}
        </Badge>
      </div>
      {children}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}

export function AgentError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-card-foreground" role="alert">
      <CircleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <Button size="xs" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function PlanCard({
  title,
  body,
  detail,
  status = "waiting",
  approveLabel,
  declineLabel = "Not now",
  onApprove,
  onDecline,
  busy = false,
  disabled = false,
  doneMessage,
}: {
  title: string;
  body: string;
  detail?: string | null;
  status?: AgentCardStatus;
  approveLabel: string;
  declineLabel?: string;
  onApprove?: () => void;
  onDecline?: () => void;
  busy?: boolean;
  disabled?: boolean;
  doneMessage?: string | null;
}) {
  return (
    <AgentCard
      title={title}
      status={doneMessage ? "done" : status}
      statusLabel={doneMessage ? "Done" : undefined}
      actions={
        doneMessage || (!onApprove && !onDecline) ? null : (
          <>
            {onApprove ? (
              <Button size="sm" variant="primary" onClick={onApprove} loading={busy} disabled={disabled}>
                {approveLabel}
              </Button>
            ) : null}
            {onDecline ? (
              <Button size="sm" variant="ghost" onClick={onDecline} disabled={busy || disabled}>
                {declineLabel}
              </Button>
            ) : null}
          </>
        )
      }
    >
      <p className="text-sm leading-relaxed text-card-foreground">{body}</p>
      {detail ? <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p> : null}
      {doneMessage ? (
        <p className="text-sm text-card-foreground" role="status">
          {doneMessage}
        </p>
      ) : null}
    </AgentCard>
  );
}

export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export function FieldChangeList({ rows }: { rows: FieldChange[] }) {
  if (!rows.length) return null;
  return (
    <dl className="space-y-1">
      {rows.map((row) => (
        <div key={row.field} className="text-xs leading-relaxed text-muted-foreground">
          <dt className="inline text-card-foreground">{row.field}: </dt>
          <dd className="inline">
            <span>{row.before?.trim() ? row.before : "Empty"}</span>
            <span aria-hidden> → </span>
            <span className="text-card-foreground">{row.after?.trim() ? row.after : "Empty"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type ToolGroupStep = {
  id: string;
  title: string;
  detail?: string | null;
  state: "running" | "done" | "failed" | "permission";
  links?: Array<{ id: string; href: string; name: string; meta?: string | null }>;
};

function StepMark({ state }: { state: ToolGroupStep["state"] }) {
  if (state === "running") return <Spinner className="size-3.5" />;
  if (state === "done") return <CheckIcon className="size-3.5 text-brand-300" aria-hidden />;
  return <CircleAlertIcon className="size-3.5 text-destructive" aria-hidden />;
}

/** One collapsed group for a series of lookups, in plain sentences. */
export function ToolGroupCard({
  label,
  pending = false,
  steps,
}: {
  label: string;
  pending?: boolean;
  steps: ToolGroupStep[];
}) {
  const [open, setOpen] = useState(pending || steps.some((step) => step.state === "failed" || step.state === "permission"));
  const failed = steps.some((step) => step.state === "failed" || step.state === "permission");
  return (
    <div className="rounded-lg border border-border/80 bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
          {pending ? <Spinner className="size-3.5" /> : failed ? <CircleAlertIcon className="size-3.5 text-destructive" aria-hidden /> : <CheckIcon className="size-3.5 text-brand-300" aria-hidden />}
          <span className={cn("truncate", pending && "shimmer motion-reduce:animate-none")}>{label}</span>
        </span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <ul className="space-y-2 border-t border-border px-3 py-2">
          {steps.map((step) => (
            <li key={step.id} className="space-y-1">
              <p className="flex items-start gap-2 text-sm text-card-foreground">
                <StepMark state={step.state} />
                <span>
                  {step.title}
                  {step.detail ? <span className="mt-0.5 block text-xs text-muted-foreground">{step.detail}</span> : null}
                </span>
              </p>
              {step.links?.length ? (
                <ul className="ms-5 space-y-1">
                  {step.links.map((link) => (
                    <li key={`${link.href}-${link.id}`}>
                      <Link href={link.href} className="text-sm text-brand-300 underline-offset-4 hover:underline">
                        {link.name}
                        {link.meta ? ` · ${link.meta}` : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function QuestionChoices({
  prompt,
  options,
  value,
  onChange,
  disabled = false,
  name,
}: {
  prompt: string;
  options: Array<{ id: string; label: string }>;
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  name?: string;
}) {
  const generatedName = useId();
  const groupName = name ?? generatedName;
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm text-card-foreground">{prompt}</legend>
      <div className="flex flex-col gap-1.5">
        {options.map((option, index) => {
          const selected = value === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                selected ? "border-brand-500/50 bg-brand-500/10 text-card-foreground" : "border-border text-muted-foreground"
              )}
            >
              <input
                type="radio"
                className="mt-1"
                name={groupName}
                checked={selected}
                onChange={() => onChange(option.id)}
              />
              <span>
                <span className="me-2 text-xs text-muted-foreground">{index + 1}</span>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
