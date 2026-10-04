"use client";

import Link from "next/link";
import { useState } from "react";

import { AssetBody } from "@/components/sales-os/asset-body";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { ASSET_STALE_DAYS, type AssetToolResult, type AssetView } from "@/lib/sales-os/asset-types";
import { captionText, cardTitle } from "@/lib/ui";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AssetMeta({ asset }: { asset: AssetView }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{asset.typeLabel}</Badge>
      <Badge variant="outline">Version {asset.version}</Badge>
      {asset.status === "superseded" ? <Badge variant="warning">Replaced by a newer version</Badge> : null}
      {asset.status === "current" && asset.dataAgeDays > ASSET_STALE_DAYS ? (
        <Badge variant="warning">Built from data {asset.dataAgeDays} days old</Badge>
      ) : null}
      {asset.reviewedAt ? <Badge variant="success">Reviewed by {asset.reviewedByName ?? "a manager"}</Badge> : <Badge variant="info">Not reviewed yet</Badge>}
    </div>
  );
}

export function AssetSummary({ asset }: { asset: AssetView }) {
  return (
    <div className="space-y-1.5">
      <h3 className={cardTitle}>{asset.title}</h3>
      <AssetMeta asset={asset} />
      <p className={captionText}>
        {asset.basis} Saved {fmt(asset.createdAt)}
        {asset.createdByName ? ` by ${asset.createdByName}` : ""}. Data from {fmt(asset.periodStart)} to {fmt(asset.periodEnd)}.
      </p>
    </div>
  );
}

/** An asset tool result: a preview of what was saved, or a plain refusal when the data doesn't support one. */
export function AssetResultCard({ result }: { result: AssetToolResult }) {
  const [expanded, setExpanded] = useState(false);
  if (result.status === "permission") {
    return <Notice tone="info" title="Owners and admins create assets">{result.message}</Notice>;
  }
  if (result.status === "insufficient_data") {
    return (
      <Notice tone="warning" title="Not enough data for this yet">
        {result.message}
      </Notice>
    );
  }
  const { asset } = result;
  return (
    <Card className="gap-3 p-4">
      <AssetSummary asset={asset} />
      <div className={expanded ? undefined : "relative max-h-64 overflow-hidden"}>
        <AssetBody markdown={asset.body} />
        {expanded ? null : <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-card to-transparent" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Read it all"}
        </Button>
        <Button variant="ghost" size="sm" render={<Link href={`/app/ask/assets/${asset.id}`} />}>
          Review or edit
        </Button>
        <span className={captionText}>{result.message}</span>
      </div>
    </Card>
  );
}

export function AssetListCard({ assets, message }: { assets: AssetView[]; message: string }) {
  if (assets.length === 0) return <Notice tone="info">{message}</Notice>;
  return (
    <Card className="gap-0 divide-y divide-border p-0">
      {assets.map((asset) => (
        <Link key={asset.id} href={`/app/ask/assets/${asset.id}`} className="block px-4 py-3 hover:bg-muted/50">
          <AssetSummary asset={asset} />
        </Link>
      ))}
    </Card>
  );
}
