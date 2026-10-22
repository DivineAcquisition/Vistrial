import { outlineText, previewLine, toOutline, type OutlineNode } from "@/lib/workflows/graph";
import { QUIET_HOURS_NOTE, type Box, type Graph } from "@/lib/workflows/types";

export function WorkflowOutline({
  graph,
  selectedId,
  onSelect,
  counts,
}: {
  graph: Graph;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  counts?: Record<string, { now: number; stalled: boolean; shareLabel?: string }>;
}) {
  const tree = toOutline(graph);
  return (
    <div className="max-w-full">
      <div className="space-y-2" role="list" aria-label="Workflow outline">
        {tree ? <NodeView node={tree} depth={0} selectedId={selectedId} onSelect={onSelect} counts={counts} /> : <p>This workflow has no start.</p>}
      </div>
      <p className="sr-only">{outlineText(tree).join(" ")}</p>
    </div>
  );
}

function NodeView({
  node,
  depth,
  selectedId,
  onSelect,
  counts,
}: {
  node: OutlineNode;
  depth: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  counts?: Record<string, { now: number; stalled: boolean; shareLabel?: string }>;
}) {
  const count = counts?.[node.box.id];
  return (
    <div className="max-w-full" role="listitem" style={{ marginInlineStart: depth ? "1rem" : 0 }}>
      <button
        type="button"
        onClick={() => onSelect?.(node.box.id)}
        className={`flex w-full min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left text-sm ${selectedId === node.box.id ? "border-brand-400 bg-brand-500/10" : "border-border bg-card"}`}
        aria-current={selectedId === node.box.id ? "true" : undefined}
      >
        <span className="font-medium text-card-foreground">{node.box.title}</span>
        <span className="text-muted-foreground">{node.box.summary}</span>
        {node.box.type === "draft" ? <span className="mt-1 text-xs text-info">Needs approval. {QUIET_HOURS_NOTE}</span> : null}
        {count ? (
          <span className="mt-1 text-xs text-muted-foreground">
            {count.now} here now{count.stalled ? ". Needs attention" : ""}
            {count.shareLabel ? `. ${count.shareLabel}` : ""}
          </span>
        ) : null}
      </button>
      {node.branches.length ? (
        <div className="mt-2 space-y-2">
          {node.branches.map((branch) => (
            <div key={`${node.box.id}-${branch.port}-${branch.boxId}`}>
              <p className="px-1 text-xs font-medium text-muted-foreground">{branch.label}</p>
              {branch.children.map((child) => (
                <NodeView key={child.box.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} counts={counts} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function boxDetail(box: Box, leadName?: string): string {
  return previewLine(box, leadName);
}
