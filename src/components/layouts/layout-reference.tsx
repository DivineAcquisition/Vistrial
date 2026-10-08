import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import type { PageLayoutKind } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

const KINDS: Array<{ id: PageLayoutKind; label: string }> = [
  { id: "standard", label: "Standard" },
  { id: "dashboard", label: "Dashboard" },
  { id: "list-detail", label: "List and detail" },
  { id: "table", label: "Table" },
  { id: "record", label: "Record" },
  { id: "workflow", label: "Workflow" },
  { id: "chat", label: "Chat" },
  { id: "message", label: "Message" },
];

const FRAMES = [
  { id: "phone", label: "Phone", width: "390px" },
  { id: "tablet", label: "Tablet", width: "800px" },
  { id: "desktop", label: "Desktop", width: "100%" },
] as const;

export function LayoutReference({ kind }: { kind: PageLayoutKind }) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-8">
      <PageHeader
        title="Layouts"
        description="Sample content in the shell at a phone width, a tablet width, and a desktop width. Nothing here is a live workspace."
      />
      <div className="flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <Link
            key={item.id}
            href={`/app/layouts?layout=${item.id}`}
            aria-current={item.id === kind ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3 text-sm",
              item.id === kind
                ? "border-brand-500/40 bg-brand-500/12 text-brand-200"
                : "border-border text-muted-foreground hover:text-card-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-col gap-10">
        {FRAMES.map((frame) => (
          <section key={frame.id} className="min-w-0">
            <h2 className="mb-3 text-sm font-medium text-card-foreground">{frame.label}</h2>
            <iframe
              title={`${frame.label} ${kind} layout`}
              src={`/app/layouts/preview?layout=${kind}`}
              className="block max-w-full rounded-xl border border-border bg-background"
              style={{ width: frame.width, height: "720px" }}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
