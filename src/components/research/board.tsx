"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { PLATFORM_LABEL } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SourceCard, type BoardSource } from "./source-card";
import { showError } from "@/lib/errors/show-error";

const READING_FIELDS = [
  ["hook", "Hook"],
  ["offer", "Offer"],
  ["callToAction", "Call to action"],
  ["format", "Format"],
  ["audienceHypothesis", "Audience (a guess)"],
] as const;

/** Two sources side by side, field by field, so a difference is easy to see. */
function Compare({ pair, onClear }: { pair: BoardSource[]; onClear: () => void }) {
  return (
    <Panel className="grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base text-card-foreground">Compare</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      {pair.length < 2 ? <p className="text-sm text-muted-foreground">Tick Compare on two sources.</p> : null}
      {pair.length === 2 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="w-36 py-2 pr-3 font-normal text-muted-foreground">
                  <span className="sr-only">Field</span>
                </th>
                {pair.map((row) => (
                  <th key={row.id} scope="col" className="py-2 pr-3 font-medium break-words text-card-foreground">
                    {PLATFORM_LABEL[row.platform] ?? row.platform}: {row.publisher ?? row.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <th scope="row" className="py-2 pr-3 align-top font-normal text-muted-foreground">
                  Title
                </th>
                {pair.map((row) => (
                  <td key={row.id} className="py-2 pr-3 align-top break-words text-card-foreground">
                    {row.title}
                  </td>
                ))}
              </tr>
              {READING_FIELDS.map(([key, label]) => (
                <tr key={key} className="border-b border-border">
                  <th scope="row" className="py-2 pr-3 align-top font-normal text-muted-foreground">
                    {label}
                  </th>
                  {pair.map((row) => (
                    <td key={row.id} className="py-2 pr-3 align-top break-words text-card-foreground">
                      {row.classification?.[key] || "Not visible"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">These are the agent&apos;s readings of what each source shows, not facts about results.</p>
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * The Visual Research Board (2.14): every source the project holds, as a card with its official embed or a
 * link card. Filter by platform, kind and relevance, keep sources in collections, and compare two.
 * `focus` narrows the board to the sources behind one finding, when opened from Findings.
 */
export function ResearchBoard({
  workspaceId,
  projectId,
  canShare,
  focus,
}: {
  workspaceId: Id<"workspaces">;
  projectId: Id<"researchProjects">;
  canShare: boolean;
  focus: string[];
}) {
  const { results, status, loadMore } = usePaginatedQuery(api.research.listSourceRefs, { workspaceId, projectId }, { initialNumItems: 60 });
  const collections = useQuery(api.collections.list, { workspaceId, projectId });
  const createCollection = useMutation(api.collections.create);
  const addItem = useMutation(api.collections.addItem);
  const [collectionFilter, setCollectionFilter] = useState("");
  const filterItems = useQuery(api.collections.items, collectionFilter ? { workspaceId, collectionId: collectionFilter as Id<"collections"> } : "skip");
  const inCollection = useMemo(() => new Set((filterItems?.items ?? []).map((row: { source: { id: string } }) => row.source.id)), [filterItems]);
  return (
    <BoardView
      sources={results as BoardSource[]}
      loading={status === "LoadingFirstPage"}
      canLoadMore={status === "CanLoadMore"}
      onLoadMore={() => loadMore(60)}
      collections={collections ?? []}
      collectionFilter={collectionFilter}
      onCollectionFilter={setCollectionFilter}
      inCollection={inCollection}
      onCreate={(name, shared) => createCollection({ workspaceId, name, shared, projectId })}
      onSave={(collectionId, sourceId) => addItem({ workspaceId, collectionId: collectionId as Id<"collections">, sourceRefId: sourceId as Id<"sourceRefs"> })}
      canShare={canShare}
      focus={focus}
    />
  );
}

type CollectionRow = { id: string; name: string; shared: boolean; items: number };

/** The board itself, from props, so a story page can show it without a backend. */
export function BoardView({
  sources,
  loading,
  canLoadMore,
  onLoadMore,
  collections,
  collectionFilter,
  onCollectionFilter,
  inCollection,
  onCreate,
  onSave,
  canShare,
  focus,
}: {
  sources: BoardSource[];
  loading: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
  collections: CollectionRow[];
  collectionFilter: string;
  onCollectionFilter: (id: string) => void;
  inCollection: Set<string>;
  onCreate: (name: string, shared: boolean) => Promise<string>;
  onSave: (collectionId: string, sourceId: string) => Promise<unknown>;
  canShare: boolean;
  focus: string[];
}) {
  const [platform, setPlatform] = useState("");
  const [kind, setKind] = useState("");
  const [relevance, setRelevance] = useState("");
  const [onlyFocus, setOnlyFocus] = useState(focus.length > 0);
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");
  const [shared, setShared] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const shown = sources.filter(
    (row) =>
      (!platform || row.platform === platform) &&
      (!kind || row.kind === kind) &&
      (!relevance || row.classification?.relevance === relevance) &&
      (!onlyFocus || focus.includes(row.id)) &&
      (!collectionFilter || inCollection.has(row.id)),
  );
  const platforms = [...new Set(sources.map((row) => row.platform))];
  const kinds = [...new Set(sources.map((row) => row.kind))];
  const pair = compare.map((id) => sources.find((row) => row.id === id)).filter((row): row is BoardSource => Boolean(row));
  const targetName = collections.find((row) => row.id === target)?.name;

  return (
    <div className="grid min-w-0 gap-4">
      <Panel className="grid gap-3 p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            aria-label="Platform"
            density="compact"
            value={platform}
            options={[{ value: "", label: "Every platform" }, ...platforms.map((row) => ({ value: row, label: PLATFORM_LABEL[row] ?? row }))]}
            onChange={(e) => setPlatform(e.target.value)}
          />
          <Select
            aria-label="Kind"
            density="compact"
            value={kind}
            options={[{ value: "", label: "Every kind" }, ...kinds.map((row) => ({ value: row, label: row.charAt(0).toUpperCase() + row.slice(1) }))]}
            onChange={(e) => setKind(e.target.value)}
          />
          <Select
            aria-label="Relevance"
            density="compact"
            value={relevance}
            options={[
              { value: "", label: "Any relevance" },
              { value: "high", label: "High relevance" },
              { value: "medium", label: "Medium relevance" },
              { value: "low", label: "Low relevance" },
            ]}
            onChange={(e) => setRelevance(e.target.value)}
          />
          <Select
            aria-label="Collection"
            density="compact"
            value={collectionFilter}
            options={[{ value: "", label: "All sources" }, ...collections.map((row) => ({ value: row.id, label: `${row.name} (${row.items})` }))]}
            onChange={(e) => onCollectionFilter(e.target.value)}
          />
        </div>
        {focus.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={onlyFocus} onCheckedChange={(checked) => setOnlyFocus(checked === true)} />
            Only the {focus.length} source{focus.length === 1 ? "" : "s"} behind the finding you opened
          </label>
        ) : null}
        <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              aria-label="Save to"
              density="compact"
              value={target}
              options={[{ value: "", label: "Choose a collection to save to" }, ...collections.map((row) => ({ value: row.id, label: `${row.name}${row.shared ? " (workspace)" : ""}` }))]}
              onChange={(e) => setTarget(e.target.value)}
            />
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void onCreate(newName, shared).then(
                  (id: string) => {
                    setTarget(id);
                    setNewName("");
                    setNotice(`Made "${newName.trim()}". Save sources to it from their cards.`);
                  },
                  (problem: unknown) => setNotice(showError(problem, "The collection was not made.")),
                );
              }}
            >
              <label className="sr-only" htmlFor="new-collection">
                New collection name
              </label>
              <Input id="new-collection" value={newName} placeholder="New collection" onChange={(event) => setNewName(event.target.value)} />
              <Button type="submit" variant="secondary" disabled={!newName.trim()}>
                Make
              </Button>
            </form>
          </div>
          {canShare ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={shared} onCheckedChange={(checked) => setShared(checked === true)} />
              Share new collections with the workspace
            </label>
          ) : null}
        </div>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {notice}
        </p>
      </Panel>

      {compare.length > 0 ? <Compare pair={pair} onClear={() => setCompare([])} /> : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading sources.</p> : null}
      {!loading && shown.length === 0 ? (
        <EmptyState kind={sources.length === 0 ? "empty" : "no-results"} preview="board" title={sources.length === 0 ? "Sources appear here as the agent finds them." : "Nothing matches these filters."} />
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((source) => (
          <li key={source.id} className="grid min-w-0">
            <SourceCard
              source={source}
              highlighted={focus.includes(source.id)}
              comparing={compare.includes(source.id)}
              compareFull={compare.length >= 2}
              onCompare={(on) => setCompare((current) => (on ? [...current, source.id].slice(-2) : current.filter((id) => id !== source.id)))}
              saveSlot={
                target ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void onSave(target, source.id).then(
                        () => setNotice(`Saved to ${targetName ?? "the collection"}.`),
                        (problem: unknown) => setNotice(showError(problem, "It was not saved.")),
                      )
                    }
                  >
                    Save
                  </Button>
                ) : null
              }
            />
          </li>
        ))}
      </ul>
      {canLoadMore ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={onLoadMore}>
          Show more sources
        </Button>
      ) : null}
    </div>
  );
}
