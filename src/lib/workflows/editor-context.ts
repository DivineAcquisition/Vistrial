import type { CheckContext } from "@/lib/workflows/types";

/**
 * What the editor may offer and the checker may look up, from real workspace
 * data. Plain arrays so it can cross from the server to the browser.
 */
export type EditorContext = {
  stages: string[];
  snippets: Array<{ id: string; name: string }>;
  talkTracks: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  roles: string[];
  /** Null when channel availability is not known yet. The checker then says so. */
  channels: Array<"text" | "email"> | null;
  routingAvailable: boolean | null;
  unhealthyChannels: Array<"text" | "email">;
};

export function toCheckContext(ctx: EditorContext): CheckContext {
  return {
    stages: new Set(ctx.stages),
    snippetIds: new Set(ctx.snippets.map((item) => item.id)),
    talkTrackIds: new Set(ctx.talkTracks.map((item) => item.id)),
    memberIds: new Set(ctx.members.map((item) => item.id)),
    roles: new Set(ctx.roles),
    channels: ctx.channels ? new Set(ctx.channels) : undefined,
    routingAvailable: ctx.routingAvailable ?? undefined,
    unhealthyChannels: new Set(ctx.unhealthyChannels),
  };
}
