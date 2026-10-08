export type SettingsSaveResult =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; error: string };
