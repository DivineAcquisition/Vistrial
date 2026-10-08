import Link from "next/link";
import type { Metadata } from "next";

import { PageFrame } from "@/components/app/page-frame";
import { AssetSummary } from "@/components/sales-os/asset-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { listAssets } from "@/lib/sales-os/assets";
import { salesOsActor } from "@/lib/sales-os/session";

export const metadata: Metadata = { title: "Scripts and assets" };

export default async function SalesOsAssetsPage({ searchParams }: { searchParams: Promise<{ old?: string }> }) {
  const actor = await salesOsActor();
  const { old } = await searchParams;
  const includeOld = old === "1";
  const assets = await listAssets(actor, { includeOld, limit: 100 });
  return (
    <PageFrame
      title="Scripts and assets"
      description="Talk tracks, ad angles, channel insights, and objection answers Vistrial built from your own calls and numbers. Each says what it was built from. Nothing here has been sent anywhere unless the record says so."
      breadcrumbs={[{ label: "Ask Vistrial", href: "/app/ask" }, { label: "Scripts and assets", href: "/app/ask/assets" }]}
      secondaryActions={
        <Button variant="ghost" size="sm" render={<Link href={includeOld ? "/app/ask/assets" : "/app/ask/assets?old=1"} />}>
          {includeOld ? "Current versions only" : "Include replaced versions"}
        </Button>
      }
    >
      {assets.length === 0 ? (
        <Notice tone="info">
          Nothing saved yet. Ask Vistrial for a talk track, ad angles, or objection answers. It will tell you if there isn&apos;t enough
          data yet.
        </Notice>
      ) : (
        <Card className="gap-0 divide-y divide-border p-0">
          {assets.map((asset) => (
            <Link key={asset.id} href={`/app/ask/assets/${asset.id}`} className="block px-4 py-3 hover:bg-muted/50">
              <AssetSummary asset={asset} />
            </Link>
          ))}
        </Card>
      )}
    </PageFrame>
  );
}
