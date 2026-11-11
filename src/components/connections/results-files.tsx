"use client";

import { canWork } from "@/lib/roles";
import { useMutation, useQuery } from "convex/react";
import { FileSpreadsheet, ShieldCheck, Trash2 } from "@/components/icons";
import { useId, useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { showError } from "@/lib/errors/show-error";

type Figures = { spend?: number; impressions?: number; clicks?: number; conversions?: number; revenue?: number };

export type ResultsUploadView = {
  id: string;
  fileName: string;
  label: string;
  currency: string;
  createdAt: number;
  status: "processing" | "ready" | "refused";
  code: string | null;
  ignoredColumns: string[];
  agents: string[];
  summary: {
    rows: number;
    dateStart: string | null;
    dateStop: string | null;
    metrics: string[];
    totals: Figures;
    groupBy: string | null;
    groups: ({ name: string } & Figures)[];
    otherGroups: number;
  } | null;
};

/** Why a file was not used, in plain words. */
export const REFUSAL_WORDS: Record<string, string> = {
  empty: "The file has no rows.",
  too_large: "The file is over 5 MB. Export a shorter date range or fewer columns.",
  too_many_rows: "The file has more than 50,000 rows. Export a shorter date range, or one row per day or campaign.",
  personal_data: "This looks like a customer list, not results. Nothing was kept. Export totals by day or campaign instead.",
  no_metrics: "No results columns were found. The file needs at least one of spend, impressions, clicks, conversions or revenue.",
  parse_failed: "The file could not be read as a CSV.",
  file_missing: "The file did not arrive. Try the upload again.",
};

const METRIC_LABEL: Record<keyof Figures, string> = {
  spend: "Spend",
  impressions: "Impressions",
  clicks: "Clicks",
  conversions: "Conversions",
  revenue: "Revenue",
};
const ORDER: (keyof Figures)[] = ["spend", "impressions", "clicks", "conversions", "revenue"];

function format(metric: keyof Figures, value: number, currency: string) {
  if (metric === "spend" || metric === "revenue") {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
    } catch {
      return `${currency} ${value.toLocaleString()}`;
    }
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function period(summary: NonNullable<ResultsUploadView["summary"]>) {
  if (!summary.dateStart || !summary.dateStop) return "No dates in the file";
  const show = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
  return summary.dateStart === summary.dateStop ? show(summary.dateStart) : `${show(summary.dateStart)} to ${show(summary.dateStop)}`;
}

/** One upload: its totals, its largest campaigns, and what was left out. */
export function ResultsUploadCard({
  upload,
  agents,
  canEdit,
  canGrant,
  highlighted,
  onGrant,
  onRemove,
}: {
  upload: ResultsUploadView;
  agents: { slug: string; name: string }[];
  canEdit: boolean;
  canGrant: boolean;
  highlighted?: boolean;
  onGrant?: (agentSlug: string, granted: boolean) => void;
  onRemove?: () => Promise<void> | void;
}) {
  const summary = upload.summary;
  const metrics = ORDER.filter((metric) => summary?.metrics.includes(metric));
  const granted = new Set(upload.agents);
  return (
    <article
      id={`upload-${upload.id}`}
      className={`grid gap-3 rounded-xl border bg-card p-4 ${highlighted ? "border-primary" : "border-border"}`}
      aria-label={`${upload.label} results`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="flex items-center gap-2 font-medium text-card-foreground">
            <FileSpreadsheet aria-hidden className="size-4 text-muted-foreground" /> {upload.label}
          </h3>
          <p className="text-xs text-muted-foreground">
            {upload.fileName}, uploaded {new Date(upload.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {summary ? `. ${period(summary)}, ${summary.rows.toLocaleString()} rows.` : "."}
          </p>
        </div>
        <span className="flex items-center gap-2">
          {upload.status === "processing" ? <StatusBadge label="Reading" tone="neutral" className="[&_span]:normal-case" /> : null}
          {upload.status === "ready" ? <StatusBadge label="Ready" tone="good" className="[&_span]:normal-case" /> : null}
          {upload.status === "refused" ? <StatusBadge label="Not used" tone="warning" className="[&_span]:normal-case" /> : null}
          {canEdit && onRemove ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${upload.label} results`}>
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              }
              title="Delete these results?"
              description="The figures are removed and agents stop using them. Reports already written keep their citation."
              confirmLabel="Delete results"
              onConfirm={onRemove}
            />
          ) : null}
        </span>
      </header>

      {upload.status === "refused" ? <p className="text-sm text-destructive">{REFUSAL_WORDS[upload.code ?? ""] ?? REFUSAL_WORDS.parse_failed}</p> : null}

      {summary ? (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {metrics.map((metric) => (
              <div key={metric} className="grid rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{METRIC_LABEL[metric]}</dt>
                <dd className="font-heading text-base text-card-foreground tabular-nums">
                  {summary.totals[metric] !== undefined ? format(metric, summary.totals[metric], upload.currency) : "—"}
                </dd>
              </div>
            ))}
          </dl>
          {summary.groups.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <caption className="sr-only">Results by {summary.groupBy ?? "campaign"}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1.5 pr-3 font-normal">
                      {summary.groupBy ?? "Campaign"}
                    </th>
                    {metrics.map((metric) => (
                      <th key={metric} scope="col" className="py-1.5 pr-3 text-right font-normal">
                        {METRIC_LABEL[metric]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.groups.map((group) => (
                    <tr key={group.name} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="max-w-[16rem] truncate py-1.5 pr-3 text-left font-normal text-card-foreground">
                        {group.name}
                      </th>
                      {metrics.map((metric) => (
                        <td key={metric} className="py-1.5 pr-3 text-right tabular-nums text-card-foreground">
                          {group[metric] !== undefined ? format(metric, group[metric], upload.currency) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.otherGroups > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary.otherGroups} smaller {summary.otherGroups === 1 ? "row is" : "rows are"} counted in the totals but not listed.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {upload.ignoredColumns.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Not read, because they hold personal details: {upload.ignoredColumns.join(", ")}.
        </p>
      ) : null}

      {upload.status === "ready" && agents.length > 0 ? (
        <ul className="grid gap-2 border-t border-border pt-3" aria-label="Agents that may use these results">
          {agents.map((agent) => (
            <li key={agent.slug} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-card-foreground">
                <ShieldCheck aria-hidden className="size-4 text-muted-foreground" /> {agent.name}
              </span>
              <Switch
                aria-label={`Let ${agent.name} use ${upload.label} results`}
                checked={granted.has(agent.slug)}
                disabled={!canGrant || !onGrant}
                onCheckedChange={(checked: boolean) => onGrant?.(agent.slug, checked)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** Upload form: the file, where it comes from, and its currency. Owners and managers. */
function UploadForm({ workspaceId, onNotice }: { workspaceId: Id<"workspaces">; onNotice: (words: string) => void }) {
  const createUpload = useMutation(api.resultUploads.createUpload);
  const start = useMutation(api.resultUploads.start);
  const [label, setLabel] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const ids = useId();
  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file || !label.trim()) {
          onNotice("Choose a file and say where it comes from.");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          onNotice(REFUSAL_WORDS.too_large);
          return;
        }
        setWorking(true);
        void (async () => {
          const url = await createUpload({ workspaceId });
          const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "text/csv" }, body: file });
          if (!response.ok) throw new Error("upload");
          const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
          await start({ workspaceId, storageId, fileName: file.name, label, currency });
          setFile(null);
          setLabel("");
          onNotice("Uploaded. The totals show below in a moment, and the file itself is deleted once read.");
        })()
          .catch((problem: unknown) => onNotice(showError(problem, "The file did not upload.")))
          .finally(() => setWorking(false));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
        <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-file`}>
          <span className="text-card-foreground">CSV file</span>
          <input
            id={`${ids}-file`}
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-label`}>
          <span className="text-card-foreground">Where it comes from</span>
          <Input id={`${ids}-label`} value={label} maxLength={60} placeholder="Google Ads, Jobber bookings…" onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-currency`}>
          <span className="text-card-foreground">Currency</span>
          <Input
            id={`${ids}-currency`}
            value={currency}
            maxLength={3}
            onChange={(event) => setCurrency(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        An export with one row per day or campaign works best. Columns for spend, impressions, clicks, conversions (or results, leads,
        bookings) and revenue are read. Names, emails, phone numbers and addresses are skipped unread, and the file is deleted once read.
      </p>
      <Button type="submit" className="w-fit" disabled={working || !file}>
        {working ? "Uploading…" : "Upload results"}
      </Button>
    </form>
  );
}

/** The workspace's results files. */
export function ResultsFiles({ workspaceId, highlight }: { workspaceId: Id<"workspaces">; highlight?: string | null }) {
  const shell = useWorkspaceShell();
  const uploads = useQuery(api.resultUploads.list, { workspaceId });
  const setAccess = useMutation(api.resultUploads.setAgentAccess);
  const remove = useMutation(api.resultUploads.remove);
  const [notice, setNotice] = useState("");
  if (!shell) return null;
  const canEdit = canWork(shell.role);
  const canGrant = shell.role === "owner";
  const live = shell.agents.filter((agent) => agent.status === "live").map((agent) => ({ slug: agent.slug, name: agent.name }));
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Results you export from your own tools: ad platforms other than Meta, your CRM, bookings or email. Only totals are kept, and the
        agents you grant cite them as your data.
      </p>
      {canEdit ? <UploadForm workspaceId={workspaceId} onNotice={setNotice} /> : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {uploads === undefined ? <p className="text-sm text-muted-foreground">Loading results files.</p> : null}
      {uploads?.length === 0 ? <p className="text-sm text-muted-foreground">No results files yet.</p> : null}
      {(uploads ?? []).map((upload) => (
        <ResultsUploadCard
          key={upload.id}
          upload={upload}
          agents={live}
          canEdit={canEdit}
          canGrant={canGrant}
          highlighted={highlight === upload.id}
          onGrant={(slug, granted) =>
            void setAccess({ workspaceId, uploadId: upload.id, agentSlug: slug, granted }).then(
              () => setNotice(granted ? "Granted." : "Withdrawn."),
              (problem: unknown) => setNotice(showError(problem, "That did not save.")),
            )
          }
          onRemove={() =>
            remove({ workspaceId, uploadId: upload.id }).then(
              () => setNotice("Deleted."),
              (problem: unknown) => setNotice(showError(problem, "That did not delete.")),
            )
          }
        />
      ))}
    </div>
  );
}
