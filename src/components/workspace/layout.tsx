import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangleIcon, PauseCircleIcon } from "lucide-react";

import { CommandBarField } from "@/components/workspace/command-bar";
import { Button } from "@/components/ui/button";
import type { Attention } from "@/lib/workspace/state";
import { STATE_COPY } from "@/lib/workspace/voice";

/**
 * The workspace frame. Phone and tablet: one column in the fixed order
 * (command bar, crew, decisions, work, briefing, numbers, live). Desktop: the
 * crew and live stream stay in a right column while the person works.
 */
export function WorkspaceLayout({
  runtime,
  banner,
  title,
  subtitle,
  crew,
  main,
  stream,
  footer,
}: {
  runtime?: ReactNode;
  banner?: ReactNode;
  title: string;
  subtitle: ReactNode;
  crew: (key: "main" | "aside") => ReactNode;
  main: ReactNode;
  stream: (key: "main" | "aside") => ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5">
      {runtime}
      {banner}
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate font-heading text-2xl text-card-foreground">{title}</h1>
        {subtitle}
      </header>
      <CommandBarField />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="min-w-0 lg:hidden">{crew("main")}</div>
          {main}
          <div className="min-w-0 lg:hidden">{stream("main")}</div>
        </div>
        <aside aria-label="Your agents and what they are doing" className="hidden min-w-0 lg:block">
          <div className="sticky top-4 flex max-h-[calc(100svh-2rem)] flex-col gap-6 overflow-y-auto pe-1">
            {crew("aside")}
            {stream("aside")}
          </div>
        </aside>
      </div>
      {footer}
    </div>
  );
}

export function AttentionNotice({ attention, paused }: { attention: Attention | null; paused: boolean }) {
  if (paused) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <PauseCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-card-foreground">{STATE_COPY.workspacePaused}</p>
      </div>
    );
  }
  if (!attention) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
      <AlertTriangleIcon aria-hidden className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-sm text-card-foreground">
        {attention.text}
        {STATE_COPY.attentionMore(attention.others)}
      </p>
      {attention.action ? (
        <Button size="sm" variant="outline" render={<Link href={attention.href} />}>
          {attention.action}
        </Button>
      ) : null}
    </div>
  );
}

export function Importing({ imported }: { imported: number }) {
  return (
    <section aria-label="Importing" className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-sm font-medium text-card-foreground">{STATE_COPY.importing(imported)}</p>
      <p className="text-sm text-muted-foreground">{STATE_COPY.importingNote}</p>
    </section>
  );
}
