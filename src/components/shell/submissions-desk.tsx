"use client";

import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Download } from "lucide-react";
import { Component, useMemo, useState, type ReactNode } from "react";

import { RedirectToSignIn } from "@/components/auth/redirect-to-sign-in";
import { useConvexReady } from "@/components/providers/convex-ready";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { submissionsCsv, type SubmissionRow } from "@/lib/submissions/csv";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SUBMISSION_KIND_LABELS } from "../../../convex/lib/submissionEmail";

class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <p className="text-sm text-muted-foreground">Not found. Staff access with a second factor is required.</p>;
    }
    return this.props.children;
  }
}

export function SubmissionsDesk() {
  const ready = useConvexReady();
  if (!ready) {
    return <EmptyState kind="unconfigured" title="Not connected" detail="The submissions list needs the Convex connection." />;
  }
  return (
    <>
      <Authenticated>
        <QuietBoundary>
          <SubmissionsPanel />
        </QuietBoundary>
      </Authenticated>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
    </>
  );
}

const STATUS_FILTERS = ["open", "new", "reviewed", "archived", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const EMAIL_TONE = { sent: "good", pending: "neutral", failed: "critical", skipped: "warning" } as const;

function when(ms: number) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function download(rows: SubmissionRow[]) {
  const blob = new Blob([submissionsCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vistrial-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function SubmissionsPanel() {
  const rows = useQuery(api.publicSubmissions.list, {}) as SubmissionRow[] | undefined;
  const setStatus = useMutation(api.publicSubmissions.setStatus);
  const resendEmail = useMutation(api.publicSubmissions.resendEmail);
  const [kind, setKind] = useState("all");
  const [status, setStatusFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (status === "open" && row.status === "archived") return false;
      if (status !== "open" && status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.name, row.email, row.business, row.summary].some((text) => text.toLowerCase().includes(needle));
    });
  }, [rows, kind, status, search]);

  if (rows === undefined) return <p className="text-sm text-muted-foreground">Loading submissions.</p>;

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.kind] = (acc[row.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={kind === "all"} onClick={() => setKind("all")}>
          All ({rows.length})
        </FilterChip>
        {Object.entries(SUBMISSION_KIND_LABELS).map(([value, label]) =>
          counts[value] ? (
            <FilterChip key={value} active={kind === value} onClick={() => setKind(value)}>
              {label} ({counts[value]})
            </FilterChip>
          ) : null,
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label="Search submissions"
          placeholder="Search name, email, business"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="sm:max-w-xs"
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === "open" ? "New and reviewed" : value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" className="sm:ml-auto" onClick={() => download(visible)} disabled={!visible.length}>
          <Download className="size-4" aria-hidden />
          Export CSV ({visible.length})
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState kind="empty" title="No submissions here" detail="New form posts from the public site appear here as they arrive." />
      ) : (
        <ul className="grid gap-2">
          {visible.map((row) => {
            const open = openId === row.id;
            return (
              <li key={row.id} className="rounded-[12px] border border-border bg-card">
                <button
                  type="button"
                  className="grid w-full gap-1 px-4 py-3 text-left sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : row.id)}
                >
                  <span className="text-xs text-muted-foreground">{when(row.createdAt)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-strong">
                      {row.name || row.email}
                      {row.business ? <span className="font-normal text-muted-foreground"> · {row.business}</span> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {SUBMISSION_KIND_LABELS[row.kind] ?? row.kind} · {row.email}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <StatusBadge label={row.status} tone={row.status === "new" ? "brand" : "neutral"} />
                    <StatusBadge label={`email ${row.emailStatus}`} tone={EMAIL_TONE[row.emailStatus]} />
                  </span>
                </button>
                {open ? (
                  <div className="grid gap-4 border-t border-border px-4 py-4">
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
                      <dt className="text-muted-foreground">Email</dt>
                      <dd>
                        <a className="text-strong underline underline-offset-4" href={`mailto:${row.email}`}>
                          {row.email}
                        </a>
                      </dd>
                      {row.fields.map((field) => (
                        <FieldRow key={field.label} label={field.label} value={field.value} />
                      ))}
                      {row.pagePath ? <FieldRow label="Page" value={row.pagePath} /> : null}
                      {row.emailError ? <FieldRow label="Email error" value={row.emailError} /> : null}
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      {row.status !== "reviewed" ? (
                        <Button type="button" size="sm" onClick={() => void setStatus({ id: row.id as Id<"publicSubmissions">, status: "reviewed" })}>
                          Mark reviewed
                        </Button>
                      ) : null}
                      {row.status !== "archived" ? (
                        <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus({ id: row.id as Id<"publicSubmissions">, status: "archived" })}>
                          Archive
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus({ id: row.id as Id<"publicSubmissions">, status: "new" })}>
                          Restore
                        </Button>
                      )}
                      {row.emailStatus === "failed" || row.emailStatus === "skipped" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => void resendEmail({ id: row.id as Id<"publicSubmissions"> })}>
                          Send email again
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-strong">{value}</dd>
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-strong bg-strong text-background" : "border-border text-muted-foreground hover:text-strong",
      )}
    >
      {children}
    </button>
  );
}
