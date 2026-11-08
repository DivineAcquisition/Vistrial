"use client";

import { CheckCircle2, CircleDot, CircleHelp, Loader, MapPin, Square, type LucideIcon } from "@/components/icons";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { HoverLift } from "@/components/motion/hover-lift";

export type SessionLite = { id: string; title: string; objective: string; geography: string; state: string; updatedAt: number; costCents: number };

export const SESSION_LOOK: Record<string, { icon: LucideIcon; label: string; ring: string; spin?: boolean }> = {
  working: { icon: Loader, label: "Working", ring: "bg-primary/10 text-primary ring-primary/30", spin: true },
  waiting: { icon: CircleHelp, label: "Waiting for you", ring: "bg-warning/10 text-warning ring-warning/30" },
  review: { icon: CircleDot, label: "Ready to review", ring: "bg-primary/10 text-primary ring-primary/30" },
  done: { icon: CheckCircle2, label: "Done", ring: "bg-success/10 text-success ring-success/30" },
  stopped: { icon: Square, label: "Stopped", ring: "bg-muted text-muted-foreground ring-border" },
  draft: { icon: CircleDot, label: "Not started", ring: "bg-muted text-muted-foreground ring-border" },
};

function ago(time: number) {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One session as a card: its state, the question it works on, where, and when it last moved. */
export function SessionCard({ session, href }: { session: SessionLite; href: string }) {
  const look = SESSION_LOOK[session.state] ?? SESSION_LOOK.draft;
  return (
    <HoverLift>
    <Link href={href} className="group grid min-w-0 content-start gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <span className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ring-1", look.ring)}>
          <look.icon aria-hidden className={cn("size-3.5", look.spin && "animate-spin motion-reduce:animate-none")} />
          {look.label}
        </span>
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
          {ago(session.updatedAt)}
        </span>
      </span>
      <span className="font-medium break-words text-card-foreground group-hover:text-primary">{session.title}</span>
      <span className="line-clamp-2 text-sm text-muted-foreground">{session.objective}</span>
      {session.geography ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin aria-hidden className="size-3" /> {session.geography}
        </span>
      ) : null}
    </Link>
    </HoverLift>
  );
}
