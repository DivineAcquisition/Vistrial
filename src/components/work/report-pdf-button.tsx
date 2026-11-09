"use client";

import { useConvex } from "convex/react";
import { useState } from "react";

import { Download } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/errors/show-error";
import { buildReportPdf, type Branding } from "@/lib/report-pdf/model";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { fileName } from "./offer-card";

/** Branding chosen per download: Vistrial-branded, or white-label with only the business's name. */
export function ReportPdfControls({ onDownload }: { onDownload: (branding: Branding) => Promise<void> }) {
  const [branding, setBranding] = useState<Branding>("vistrial");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div role="radiogroup" aria-label="PDF branding" className="flex rounded-lg border border-border p-0.5 text-xs">
          {(
            [
              ["vistrial", "Vistrial"],
              ["whiteLabel", "White-label"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={branding === value}
              onClick={() => setBranding(value)}
              className={branding === value ? "rounded-md bg-primary/15 px-2 py-1 text-card-foreground" : "rounded-md px-2 py-1 text-muted-foreground hover:text-card-foreground"}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setProblem("");
            void onDownload(branding).then(
              () => setBusy(false),
              (error: unknown) => {
                setBusy(false);
                setProblem(showError(error, "The PDF was not made."));
              },
            );
          }}
        >
          <Download aria-hidden className="size-4" /> {busy ? "Making PDF…" : "PDF"}
        </Button>
      </div>
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </div>
  );
}

/** Reads the report's data, builds the PDF in the browser, and downloads it. Nothing leaves for a server. */
export function ReportPdfButton({ workspaceId, assetId }: { workspaceId: Id<"workspaces">; assetId: Id<"assets"> }) {
  const convex = useConvex();
  return (
    <ReportPdfControls
      onDownload={async (branding) => {
        const data = await convex.query(api.workTabs.reportPdf, { workspaceId, assetId });
        const model = buildReportPdf(data, { branding, generatedAt: Date.now() });
        const [{ pdf }, { ReportPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./report-pdf")]);
        const blob = await pdf(ReportPdf({ model })).toBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName(data.title)}${branding === "whiteLabel" ? "-white-label" : ""}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }}
    />
  );
}
