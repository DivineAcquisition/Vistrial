"use client";

import { MoreHorizontalIcon, PlusIcon, Share2Icon } from "lucide-react";
import { useState } from "react";

import {
  deleteConversationAction,
  renameConversationAction,
  shareConversationAction,
  unshareConversationAction,
} from "@/app/(workspace)/app/compass/actions";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { toastManager } from "@/components/ui/toast";
import type { ConversationRow } from "@/lib/compass/persist";
import { captionText } from "@/lib/ui";
import { cn } from "@/lib/utils";

function when(row: ConversationRow): string {
  const at = row.lastMessageAt ?? row.createdAt;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** The person's own conversations. Nobody else sees this list. */
export function ConversationList({
  rows,
  activeId,
  onSelect,
  onNew,
  onChanged,
}: {
  rows: ConversationRow[];
  activeId: string | null;
  onSelect: (row: ConversationRow) => void;
  onNew: () => void;
  onChanged: (next: ConversationRow[], removedId?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const needle = search.trim().toLowerCase();
  const filtered = needle ? rows.filter((row) => (row.title ?? "").toLowerCase().includes(needle)) : rows;
  const current = filtered.filter((row) => !row.legacy);
  const legacy = filtered.filter((row) => row.legacy);

  const update = (id: string, patch: Partial<ConversationRow>) => onChanged(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const remove = async (row: ConversationRow) => {
    const result = await deleteConversationAction(row.id, row.legacy);
    setConfirmDelete(null);
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return;
    }
    onChanged(
      rows.filter((item) => item.id !== row.id),
      row.id
    );
    toastManager.add({ title: "Conversation deleted.", type: "success" });
  };

  const share = async (row: ConversationRow) => {
    const result = await shareConversationAction(row.id);
    if (!result.ok) return toastManager.add({ title: result.error, type: "error" });
    update(row.id, { shared: { until: result.data?.until ?? new Date(Date.now() + 7 * 86_400_000).toISOString() } });
    toastManager.add({ title: result.message ?? "Shared.", type: "success" });
  };

  const unshare = async (row: ConversationRow) => {
    const result = await unshareConversationAction(row.id);
    if (!result.ok) return toastManager.add({ title: result.error, type: "error" });
    update(row.id, { shared: null });
    toastManager.add({ title: result.message ?? "Stopped sharing.", type: "success" });
  };

  const item = (row: ConversationRow) => {
    const active = row.id === activeId;
    if (renaming === row.id) {
      return (
        <li key={row.id}>
          <form
            className="flex items-center gap-1 px-1 py-1"
            onSubmit={async (event) => {
              event.preventDefault();
              const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
              setRenaming(null);
              if (!title) return;
              update(row.id, { title });
              await renameConversationAction(row.id, title);
            }}
          >
            <input
              name="title"
              defaultValue={row.title ?? ""}
              maxLength={80}
              autoFocus
              aria-label="Conversation name"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-sm text-card-foreground outline-none focus-visible:border-brand-500/55"
              onKeyDown={(event) => {
                if (event.key === "Escape") setRenaming(null);
              }}
            />
            <Button type="submit" size="xs">
              Save
            </Button>
          </form>
        </li>
      );
    }
    if (confirmDelete === row.id) {
      return (
        <li key={row.id} className="flex flex-col gap-2 rounded-lg border border-destructive/40 px-2 py-2" role="alertdialog" aria-label="Delete this conversation?">
          <p className="text-sm text-card-foreground">Delete this conversation? It is removed for good{row.shared ? ", and the Vistrial team can no longer open it" : ""}.</p>
          <div className="flex gap-1.5">
            <Button size="xs" variant="destructive" onClick={() => remove(row)}>
              Delete
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(null)} autoFocus>
              Cancel
            </Button>
          </div>
        </li>
      );
    }
    return (
      <li key={row.id} className={cn("group flex items-center gap-1 rounded-lg", active ? "bg-muted" : "hover:bg-muted/60")}>
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-start px-2 py-1.5 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-current={active ? "true" : undefined}
          onClick={() => onSelect(row)}
        >
          <span className="w-full truncate text-sm text-card-foreground">{row.title ?? "New conversation"}</span>
          <span className={cn(captionText, "flex items-center gap-1")}>
            {when(row)}
            {row.shared ? (
              <>
                <Share2Icon className="size-3" aria-hidden />
                <span>Shared with the Vistrial team</span>
              </>
            ) : null}
          </span>
        </button>
        <Menu>
          <MenuTrigger
            aria-label={`Options for ${row.title ?? "this conversation"}`}
            className="me-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-card-foreground"
          >
            <MoreHorizontalIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end" className="w-60">
            {row.legacy ? null : <MenuItem onClick={() => setRenaming(row.id)}>Rename</MenuItem>}
            {row.legacy ? null : row.shared ? (
              <MenuItem onClick={() => unshare(row)}>Stop sharing</MenuItem>
            ) : (
              <MenuItem onClick={() => share(row)}>Share with the Vistrial team for 7 days</MenuItem>
            )}
            {row.legacy ? null : <MenuSeparator />}
            <MenuItem variant="destructive" onClick={() => setConfirmDelete(row.id)}>
              Delete
            </MenuItem>
          </MenuPopup>
        </Menu>
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Button variant="outline" onClick={onNew} className="justify-start">
        <PlusIcon aria-hidden />
        New conversation
      </Button>
      <SearchInput placeholder="Search your conversations" aria-label="Search your conversations" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {current.length ? (
          <ul className="flex flex-col gap-0.5">{current.map(item)}</ul>
        ) : (
          <p className={cn(captionText, "px-2")}>{needle ? "No conversations match." : "Your conversations show here."}</p>
        )}
        {legacy.length ? (
          <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
            <p className={cn(captionText, "px-2")}>From before Compass (read only)</p>
            <ul className="flex flex-col gap-0.5">{legacy.map(item)}</ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
