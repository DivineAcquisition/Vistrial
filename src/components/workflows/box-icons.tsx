import {
  CirclePlayIcon,
  ClipboardCheckIcon,
  FlagIcon,
  GitBranchIcon,
  HourglassIcon,
  MessageSquareTextIcon,
  RouteIcon,
  StickyNoteIcon,
  type LucideIcon,
} from "lucide-react";

import type { BoxKind } from "@/lib/workflows/types";

export const BOX_ICONS: Record<BoxKind, LucideIcon> = {
  start: CirclePlayIcon,
  wait: HourglassIcon,
  check: GitBranchIcon,
  draft: MessageSquareTextIcon,
  task: ClipboardCheckIcon,
  route: RouteIcon,
  end: FlagIcon,
  note: StickyNoteIcon,
};

/** What each box does, in the add menu. */
export const BOX_HINTS: Record<BoxKind, string> = {
  start: "What puts a lead into this workflow.",
  wait: "Wait some hours or days, or until a time of day.",
  check: "A yes or no question with two ways out.",
  draft: "Relay drafts a text or email. You approve it before it sends.",
  task: "A task or alert for a person on the team.",
  route: "Assign an owner, or ask before reassigning one.",
  end: "Where the lead leaves this workflow.",
  note: "A label on the picture. It does nothing.",
};
