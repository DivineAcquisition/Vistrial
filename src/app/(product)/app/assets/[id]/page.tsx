"use client";

import { isAdmin } from "@/lib/roles";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { EvidenceList, VersionCompare, VersionHistory, claimMissing, type EvidenceView } from "@/components/assets/asset-parts";
import { AssetStatusBadge, assetKindLabel } from "@/components/runs/run-parts";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { ReportBody, reportMarkdown } from "@/components/assets/report-body";
import { ReportGlanceView } from "@/components/assets/report-glance";
import { ModelMark } from "@/components/readable";
import { reportGlance } from "@/lib/readable/report";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { showError } from "@/lib/errors/show-error";

function Asset({ shell, assetId }: { shell: WorkspaceShell; assetId: Id<"assets"> }) {
  const asset = useQuery(api.assets.get, { workspaceId: shell.workspaceId, assetId });
  const approve = useMutation(api.assets.approve);
  const reject = useMutation(api.assets.reject);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = picked ?? asset?.currentVersion ?? 1;
  const viewingOld = asset !== undefined && selected !== asset.currentVersion;
  const older = useQuery(
    api.assets.version,
    asset && viewingOld ? { workspaceId: shell.workspaceId, assetId, version: selected } : "skip",
  );
  const previous = useQuery(
    api.assets.version,
    asset && comparing && selected > 1 ? { workspaceId: shell.workspaceId, assetId, version: selected - 1 } : "skip",
  );

  if (asset === undefined) return <p className="text-sm text-muted-foreground">Loading the asset.</p>;
  const shown = viewingOld ? older : { body: asset.body, evidence: asset.evidence as EvidenceView[] };
  const editor = isAdmin(shell.role);
  const missingSource = (asset.evidence as EvidenceView[]).some(claimMissing);
  const status = asset.status as "draft" | "needsReview" | "approved" | "rejected" | "archived";

  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <header className="grid gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{assetKindLabel(asset.kind)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl break-words text-foreground">{asset.title}</h1>
          <AssetStatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Version {asset.currentVersion}.{" "}
          {asset.createdByRun ? (
            <Link className="underline underline-offset-4" href={`/app/runs/${asset.createdByRun}`}>
              See the run that made it
            </Link>
          ) : (
            "Added by a person."
          )}{" "}
          </p>
        <ModelMark model={asset.model} />
        {status === "needsReview" ? (
          <p className="text-sm text-destructive">
            This draft did not pass its checks. Edit it to add a new version, or reject it with a reason.
          </p>
        ) : null}
        {editor && status === "draft" ? (
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Button
              type="button"
              disabled={missingSource}
              onClick={() =>
                void approve({ workspaceId: shell.workspaceId, assetId }).then(
                  () => setNotice(`Version ${asset.currentVersion} approved.`),
                  () => setNotice("It was not approved. It may have changed. Look again and retry."),
                )
              }
            >
              Approve version {asset.currentVersion}
            </Button>
            {missingSource ? <p className="text-sm text-destructive">A claim has no source, so it cannot be approved yet.</p> : null}
          </div>
        ) : null}
        {editor && (status === "draft" || status === "needsReview") ? (
          rejecting ? (
            <form
              className="grid max-w-xl gap-2 print:hidden"
              onSubmit={(event) => {
                event.preventDefault();
                void reject({ workspaceId: shell.workspaceId, assetId, reason }).then(
                  () => {
                    setRejecting(false);
                    setReason("");
                    setNotice("Rejected. The reason is saved as feedback.");
                  },
                  (error: unknown) => setNotice(showError(error, "It was not rejected.")),
                );
              }}
            >
              <label className="grid gap-2 text-sm" htmlFor="reject-reason">
                Why are you rejecting it?
                <Textarea id="reject-reason" value={reason} required minLength={3} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" size="sm" disabled={reason.trim().length < 3}>
                  Reject with this reason
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="print:hidden">
              <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </div>
          )
        ) : null}
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {notice}
        </p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid min-w-0 gap-6">
          {shown && !comparing && shown.body && /^#{1,3}\s/m.test(shown.body) ? <ReportGlanceView glance={reportGlance(shown.body, (shown.evidence as EvidenceView[]).map((claim) => ({ basisLabel: claim.basisLabel, sources: claim.sources, missing: claimMissing(claim) })))} /> : null}
          <Panel className="grid gap-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-base text-card-foreground">
                {viewingOld ? `The full report, version ${selected} (older)` : `The full report, version ${selected}`}
              </h2>
              <div className="flex flex-wrap gap-2 print:hidden">
                {selected > 1 ? (
                  <Button type="button" variant="outline" size="sm" aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
                    {comparing ? "Hide changes" : `Compare with version ${selected - 1}`}
                  </Button>
                ) : null}
                {shown ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const text = reportMarkdown(asset.title, selected, shown.body ?? "", shown.evidence as EvidenceView[]);
                      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `${asset.title.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "report"}-v${selected}.md`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download Markdown
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
                  Print or save as PDF
                </Button>
              </div>
            </div>
            {shown === undefined ? <p className="text-sm text-muted-foreground">Loading the version.</p> : null}
            {shown && comparing && previous ? (
              <VersionCompare before={previous.body} after={shown.body} beforeVersion={selected - 1} afterVersion={selected} />
            ) : shown ? (
              shown.body && /^#{1,3}\s/m.test(shown.body) ? (
                <ReportBody body={shown.body} />
              ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-card-foreground">
                  {shown.body || "This version has no text."}
                </div>
              )
            ) : null}
          </Panel>
          <Panel className="grid gap-3 p-4 sm:p-6">
            <h2 id="report-claims" className="scroll-mt-24 font-heading text-base text-card-foreground">Claims and evidence</h2>
            {shown ? <EvidenceList evidence={shown.evidence as EvidenceView[]} /> : null}
          </Panel>
        </div>
        <Panel className="grid content-start gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Versions</h2>
          <VersionHistory
            versions={asset.versions}
            current={asset.currentVersion}
            selected={selected}
            onSelect={(version) => {
              setPicked(version);
              setComparing(false);
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

export default function AssetPage() {
  const params = useParams<{ id: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your organization." />;
  return <Asset shell={shell} assetId={params.id as Id<"assets">} />;
}
