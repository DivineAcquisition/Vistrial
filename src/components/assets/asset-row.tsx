import Link from "next/link";

import { AssetStatusBadge, assetKindLabel } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";

export type AssetRowView = {
  id: string;
  title: string;
  kind: string;
  status: "draft" | "approved" | "archived";
  currentVersion: number;
  createdAt: number;
  createdByRun: string | null;
};

/**
 * One asset in a queue or the library: what it is, where it came from, and a way in.
 * Approval happens on the asset page, where the claims and their sources are in view.
 */
export function AssetRow({ asset }: { asset: AssetRowView }) {
  return (
    <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="font-medium break-words text-card-foreground">
          <Link className="underline-offset-4 hover:underline" href={`/app/assets/${asset.id}`}>
            {asset.title}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          {assetKindLabel(asset.kind)}, version {asset.currentVersion}. Made{" "}
          {new Date(asset.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          {asset.createdByRun ? " by an agent run." : " by a person."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AssetStatusBadge status={asset.status} />
        <Button render={<Link href={`/app/assets/${asset.id}`} />} variant={asset.status === "draft" ? "primary" : "outline"} size="sm">
          {asset.status === "draft" ? "Review" : "Open"}
        </Button>
      </div>
    </div>
  );
}
