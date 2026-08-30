export type AgentAssetDraft = {
  title: string;
  body: string;
  dataBasis: string;
  sampleSize: number;
  version: number;
  generatedAt: Date;
  verbatimProspectLanguage: boolean;
  exportedAt: Date | null;
  exportedBy: string | null;
};

export function assetLeavesVistrial(asset: AgentAssetDraft): boolean {
  return asset.exportedAt !== null && asset.exportedBy !== null;
}

export function assetExportBlocked(args: {
  reviewed: boolean;
  verbatimFlagged: boolean;
  sampleSize: number;
  dataBasis: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!args.dataBasis.trim()) {
    return { ok: false, reason: "Every asset has to say what it was built from." };
  }
  if (args.sampleSize < 1) {
    return { ok: false, reason: "Every asset has to state its sample size." };
  }
  if (!args.reviewed) {
    return { ok: false, reason: "Review it before it leaves Vistrial." };
  }
  if (args.verbatimFlagged === false) {
    return { ok: false, reason: "Flag verbatim prospect language before export." };
  }
  return { ok: true };
}

export function agentMayEmailOrShareAsset(): boolean {
  return false;
}
