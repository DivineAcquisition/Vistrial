/** The absences a page can be in, shown on the layouts reference beside the filled sample. */
export const LAYOUT_STATES = [
  { id: "ready", label: "With content" },
  { id: "loading", label: "Loading" },
  { id: "empty", label: "Nothing yet" },
  { id: "no-results", label: "No matches" },
  { id: "unconfigured", label: "Not connected" },
  { id: "error", label: "Something failed" },
  { id: "permission", label: "Not allowed" },
] as const;

export type LayoutState = (typeof LAYOUT_STATES)[number]["id"];

export function isLayoutState(value: string | undefined): value is LayoutState {
  return LAYOUT_STATES.some((state) => state.id === value);
}
