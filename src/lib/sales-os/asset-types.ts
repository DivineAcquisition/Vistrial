import type { AssetType } from "@/lib/sales-os/catalog";

export type AssetView = {
  id: string;
  familyId: string;
  version: number;
  type: AssetType;
  typeLabel: string;
  title: string;
  body: string;
  basis: string;
  sampleSize: number;
  periodStart: string;
  periodEnd: string;
  status: "current" | "superseded";
  origin: "agent" | "edit";
  createdAt: string;
  createdByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  /** Days between the end of the data it was built from and now. */
  dataAgeDays: number;
};

export type AssetToolResult =
  | { kind: "asset"; status: "created"; asset: AssetView; message: string }
  | { kind: "asset"; status: "insufficient_data"; message: string; have: number; need: number; what: string }
  | { kind: "asset"; status: "permission"; message: string };

/** An asset built from data that ended this long ago is labelled as dated wherever it shows. */
export const ASSET_STALE_DAYS = 30;
