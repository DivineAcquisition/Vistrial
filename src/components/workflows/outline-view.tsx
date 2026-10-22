import { Badge } from "@/components/ui/badge";
import { kindLabel } from "@/lib/workflows/describe";
import { outlineSentence, type OutlineItem } from "@/lib/workflows/outline";

/**
 * The list form of a workflow. It reads the same graph the canvas draws, one
 * row per box, with branches indented. It is also the accessible and phone
 * form of the picture, so every connection is readable here.
 */
export function OutlineView({ items }: { items: OutlineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">This workflow has no boxes yet.</p>;
  }
  return (
    <ol className="space-y-2" aria-label="Workflow steps">
      {items.map((item, index) => (
        <li
          key={`${item.boxId}-${index}`}
          style={{ marginLeft: `${Math.min(item.depth, 4) * 1.25}rem` }}
          className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            {item.branch ? (
              <Badge size="sm" variant="outline">
                {item.branch}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{kindLabel(item.kind)}</span>
          </div>
          <p className="mt-1 text-sm">{outlineSentence(item)}</p>
        </li>
      ))}
    </ol>
  );
}
