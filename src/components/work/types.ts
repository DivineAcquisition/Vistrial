import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

/** What each work tab reads, typed from the server so a screen and its story draw the same shape. */
export type TabData = FunctionReturnType<typeof api.workTabs.tab>;
export type RunningRun = TabData["running"][number];
export type FinishedRun = TabData["finished"][number];
export type ResultRow = TabData["results"][number];
export type SuggestionRow = TabData["suggestions"][number];

export type OfferCardRow = FunctionReturnType<typeof api.offers.list>[number];
export type OfferCardFull = FunctionReturnType<typeof api.offers.get>;
export type OfferVersion = OfferCardFull["versions"][number];
export type OfferComparison = FunctionReturnType<typeof api.offers.compare>;
export type OfferAnalysisView = NonNullable<FunctionReturnType<typeof api.offers.analysis>>;

export type BrandKitRow = FunctionReturnType<typeof api.brandKits.list>[number];
export type BrandKitFull = FunctionReturnType<typeof api.brandKits.get>;

export type DiagnosticsData = FunctionReturnType<typeof api.workTabs.diagnostics>;
export type DiagnosisView = NonNullable<DiagnosticsData["diagnosis"]>;
export type GoalView = DiagnosticsData["goal"];
export type ConnectedData = DiagnosticsData["data"];

export type ItemDecision = FunctionReturnType<typeof api.decisions.forAsset>[number];

export type ReportPdfData = FunctionReturnType<typeof api.workTabs.reportPdf>;

export type SkillChatData = FunctionReturnType<typeof api.skillIntake.get>;

export type ReviewActions = {
  approve: (assetId: string) => Promise<void>;
  reject: (assetId: string, reason: string) => Promise<void>;
  requestChanges: (assetId: string, reason: string) => Promise<void>;
};
