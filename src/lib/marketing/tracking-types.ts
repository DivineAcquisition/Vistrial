export type TrackingCategory = "essential" | "analytics" | "advertising";

export type TrackingTool = {
  slug: string;
  name: string;
  company: string;
  category: TrackingCategory;
  purpose: string;
  collects: string;
  storage: string;
  duration: string;
  privacyUrl: string;
  enabled: boolean;
};

export type TrackingSettings = {
  version: number;
  lifetimeDays: number;
  dismissDays: number;
};
