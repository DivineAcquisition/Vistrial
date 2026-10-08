import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { AssetEditor } from "@/components/sales-os/asset-editor";
import { Card, CardPanel } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { assetHistory, loadAsset } from "@/lib/sales-os/assets";
import { salesOsActor } from "@/lib/sales-os/session";
import { captionText, sectionTitle } from "@/lib/ui";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function SalesOsAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await salesOsActor();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const asset = await loadAsset(actor, id);
  if (!asset) notFound();
  const versions = await assetHistory(actor, asset.familyId);
  const current = versions.find((v) => v.status === "current");

  return (
    <PageFrame
      title={asset.title}
      description={`${asset.typeLabel}, version ${asset.version}.`}
      breadcrumbs={[
        { label: "Ask Vistrial", href: "/app/ask" },
        { label: "Scripts and assets", href: "/app/ask/assets" },
        { label: asset.title, href: `/app/ask/assets/${asset.id}` },
      ]}
    >
      {asset.status === "superseded" && current ? (
        <Notice tone="warning" title="This version has been replaced">
          You&apos;re reading version {asset.version}. The current one is{" "}
          <Link className="underline" href={`/app/ask/assets/${current.id}`}>
            version {current.version}
          </Link>
          . An old version can&apos;t be sent anywhere.
        </Notice>
      ) : null}

      <AssetEditor asset={asset} canEdit={actor.canWriteAssets && asset.status === "current"} />

      <section className="space-y-3">
        <h2 className={sectionTitle}>Versions</h2>
        <Card>
          <CardPanel className="p-0">
            <ul className="divide-y divide-border">
              {versions.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <Link href={`/app/ask/assets/${version.id}`} className="text-sm font-medium text-card-foreground hover:underline">
                    Version {version.version}
                  </Link>
                  <span className={captionText}>
                    {version.origin === "edit" ? "Edited" : "Built"} {fmt(version.createdAt)}
                    {version.createdByName ? ` by ${version.createdByName}` : ""} · {version.status === "current" ? "current" : "replaced"}
                    {version.reviewedAt ? ` · reviewed by ${version.reviewedByName ?? "a manager"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardPanel>
        </Card>
      </section>
    </PageFrame>
  );
}
