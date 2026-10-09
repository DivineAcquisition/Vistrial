import Link from "next/link";
import { FileTextIcon, PhoneIcon, ScrollTextIcon, Settings2Icon, StickyNoteIcon, UserIcon } from "lucide-react";

import type { SourceKind, SourceRef } from "@/lib/live/model";

const ICONS: Record<SourceKind, typeof FileTextIcon> = {
  transcript: FileTextIcon,
  case_file: ScrollTextIcon,
  configuration: Settings2Icon,
  lead: UserIcon,
  note: StickyNoteIcon,
  call: PhoneIcon,
  record: FileTextIcon,
  file: FileTextIcon,
};

/** What an agent looked at, as references. Never the content itself. */
export function SourceChips({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Sources used">
      {sources.map((source, index) => {
        const Icon = ICONS[source.kind] ?? FileTextIcon;
        const body = (
          <>
            <Icon className="size-3" aria-hidden />
            <span className="max-w-48 truncate">{source.label}</span>
          </>
        );
        const className =
          "inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5 text-xs text-card-foreground";
        return (
          <li key={`${source.kind}-${source.label}-${index}`}>
            {source.href ? (
              <Link href={source.href} className={`${className} hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring`}>
                {body}
              </Link>
            ) : (
              <span className={className}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
