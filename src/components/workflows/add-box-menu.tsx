"use client";

import type { ReactNode } from "react";

import { BOX_HINTS, BOX_ICONS } from "@/components/workflows/box-icons";
import { kindLabel } from "@/lib/workflows/describe";
import { ADDABLE_KINDS, type AddableKind } from "@/lib/workflows/edit";

/** The short list of box types, the same in the canvas toolbar and the outline. */
export function AddBoxItems({ render, include = ADDABLE_KINDS }: { render: (kind: AddableKind, body: ReactNode) => ReactNode; include?: readonly AddableKind[] }) {
  return (
    <>
      {include.map((kind) => {
        const Icon = BOX_ICONS[kind];
        return render(
          kind,
          <span className="flex items-start gap-2.5 py-0.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm text-card-foreground">{kindLabel(kind)}</span>
              <span className="block text-xs leading-snug text-muted-foreground">{BOX_HINTS[kind]}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}
