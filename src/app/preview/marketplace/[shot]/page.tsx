import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  MARKETPLACE_SHOTS,
  MarketplaceShotFrame,
  type MarketplaceShot,
} from "@/components/marketing/marketplace-shots";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Marketplace preview",
};

function isShot(value: string): value is MarketplaceShot {
  return (MARKETPLACE_SHOTS as readonly string[]).includes(value);
}

export default async function MarketplacePreviewPage({
  params,
}: {
  params: Promise<{ shot: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { shot } = await params;
  if (!isShot(shot)) notFound();

  return (
    <div className="flex min-h-screen items-start justify-center bg-ink-950">
      <MarketplaceShotFrame shot={shot} />
    </div>
  );
}
