export const PREVIEW_STATES = ["steady", "first", "importing", "quiet", "attention", "paused", "member", "operator"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];
