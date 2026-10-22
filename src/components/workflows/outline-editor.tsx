"use client";

import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, CornerDownRightIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { AddBoxItems } from "@/components/workflows/add-box-menu";
import { BOX_ICONS } from "@/components/workflows/box-icons";
import { kindLabel } from "@/lib/workflows/describe";
import { exitsOf, moveWithinBranch, type AddableKind } from "@/lib/workflows/edit";
import { boxById } from "@/lib/workflows/graph";
import { outlineSentence, toOutline } from "@/lib/workflows/outline";
import type { CheckIssue, EdgeExit, WorkflowGraph } from "@/lib/workflows/types";
import { cn } from "@/lib/utils";

/**
 * The list form of a workflow, and its phone and screen reader form. It reads
 * the same graph as the canvas. Every box can be opened, moved within its
 * branch, added after, and removed, so nothing needs the picture.
 */
export function OutlineEditor({
  graph,
  issues,
  selectedId,
  editable,
  onSelect,
  onChange,
  onAdd,
  onRemove,
}: {
  graph: WorkflowGraph;
  issues: CheckIssue[];
  selectedId: string | null;
  editable: boolean;
  onSelect: (id: string) => void;
  onChange: (graph: WorkflowGraph) => void;
  onAdd: (kind: AddableKind, after?: { fromId: string; exit: EdgeExit }) => void;
  onRemove: (id: string) => void;
}) {
  const rows = toOutline(graph);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">This workflow has no boxes yet.</p>;

  return (
    <ol className="space-y-2" aria-label="Workflow steps, in order">
      {rows.map((row, index) => {
        const box = boxById(graph, row.boxId);
        if (!box) return null;
        const Icon = BOX_ICONS[row.kind];
        const errors = issues.filter((issue) => issue.boxId === row.boxId && issue.severity === "error").length;
        const up = editable ? moveWithinBranch(graph, row.boxId, "up") : graph;
        const down = editable ? moveWithinBranch(graph, row.boxId, "down") : graph;
        const exits = exitsOf(box.config);
        const selected = selectedId === row.boxId && !row.goesTo;
        return (
          <li key={`${row.boxId}-${index}`} style={{ marginLeft: `${Math.min(row.depth, 4) * 1.25}rem` }}>
            <div
              className={cn(
                "rounded-xl border bg-card px-3 py-2.5 transition-colors",
                selected ? "border-primary/60 bg-primary/6" : "border-border",
                row.kind === "note" && "border-dashed bg-muted",
                row.goesTo && "border-dashed bg-transparent"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {row.branch ? (
                  <Badge size="sm" variant="outline">
                    {row.branch}
                  </Badge>
                ) : null}
                {row.goesTo ? <CornerDownRightIcon className="size-3.5 text-muted-foreground" aria-hidden /> : <Icon className="size-3.5 text-muted-foreground" aria-hidden />}
                <span className="text-xs text-muted-foreground">{row.goesTo ? (row.loopPasses ? "Counted loop" : "Joins") : kindLabel(row.kind)}</span>
                {errors > 0 && !row.goesTo ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive-foreground">
                    <CircleAlertIcon className="size-3.5" aria-hidden />
                    {errors === 1 ? "1 to fix" : `${errors} to fix`}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-card-foreground">{outlineSentence(row)}</p>
              {!row.goesTo ? (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Button size="xs" variant={selected ? "secondary" : "ghost"} onClick={() => onSelect(row.boxId)} aria-label={`${editable ? "Edit" : "Open"} ${row.title}`}>
                    <PencilIcon aria-hidden />
                    {editable ? "Edit" : "Open"}
                  </Button>
                  {editable ? (
                    <>
                      <Button size="icon-sm" variant="ghost" disabled={up === graph} onClick={() => onChange(up)} aria-label={`Move ${row.title} up`}>
                        <ArrowUpIcon aria-hidden />
                      </Button>
                      <Button size="icon-sm" variant="ghost" disabled={down === graph} onClick={() => onChange(down)} aria-label={`Move ${row.title} down`}>
                        <ArrowDownIcon aria-hidden />
                      </Button>
                      {exits.map((item) => (
                        <Menu key={item.exit}>
                          <MenuTrigger render={<Button size="xs" variant="ghost" />} aria-label={`Add a box after ${row.title}${exits.length > 1 ? `, on ${item.label}` : ""}`}>
                            <PlusIcon aria-hidden />
                            {exits.length > 1 ? item.label : "Add"}
                          </MenuTrigger>
                          <MenuPopup side="bottom" align="start" className="w-64">
                            <MenuGroup>
                              <MenuGroupLabel>Add a box</MenuGroupLabel>
                              <AddBoxItems
                                render={(kind, body) => (
                                  <MenuItem key={kind} onClick={() => onAdd(kind, { fromId: row.boxId, exit: item.exit })}>
                                    {body}
                                  </MenuItem>
                                )}
                              />
                            </MenuGroup>
                          </MenuPopup>
                        </Menu>
                      ))}
                      {row.kind !== "start" ? (
                        <Button size="icon-sm" variant="ghost" onClick={() => onRemove(row.boxId)} aria-label={`Remove ${row.title}`}>
                          <Trash2Icon aria-hidden />
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
      {editable ? (
        <li>
          <Button size="sm" variant="outline" onClick={() => onAdd("note")}>
            <PlusIcon aria-hidden />
            Add a note
          </Button>
        </li>
      ) : null}
    </ol>
  );
}
