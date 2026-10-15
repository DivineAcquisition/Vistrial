"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { useOrg } from "@/components/app/org-provider";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogTitle,
  CommandDialogTrigger,
  CommandEmpty,
  CommandFooter,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { DA_CONSOLE_LINKS, MORE_NAV, PRIMARY_NAV, navVisibleTo } from "@/lib/navigation";
import { shellNavigation } from "@/lib/shell/nav";

type JumpItem = {
  value: string;
  label: string;
  href: string;
  group: string;
};

export function AppJumpPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [meaning, setMeaning] = useState(false);
  const [remote, setRemote] = useState<JumpItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const { role, isStaff, workspaceRole, templateAccess, org } = useOrg();

  const items = useMemo<JumpItem[]>(() => {
    const shell = shellNavigation({
      role: workspaceRole,
      templateAccess,
      workspaceName: org.name,
    });
    const shellItems = shell.groups.flatMap((group) =>
      group.items.flatMap((item) => [item, ...(item.children ?? [])])
    );
    const dests = [
      ...PRIMARY_NAV,
      ...MORE_NAV.filter(
        (item) =>
          !PRIMARY_NAV.some(
            (primary) => primary.href === item.href && navVisibleTo(primary, role, isStaff)
          )
      ),
    ];
    const pages = dests
      .filter((item) => navVisibleTo(item, role, isStaff))
      .map((item) => ({
        value: item.href,
        label: item.label,
        href: item.href,
        group: item.group === "front" ? "Main" : "Also",
      }));
    const seen = new Set(pages.map((item) => item.href));
    for (const item of shellItems) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      pages.push({ value: item.href, label: item.label, href: item.href, group: "Main" });
    }
    if (isStaff) {
      for (const item of DA_CONSOLE_LINKS) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);
        pages.push({ value: item.href, label: item.label, href: item.href, group: "Also" });
      }
    }
    pages.push({ value: "/app/tasks", label: "Tasks", href: "/app/tasks", group: "Main" });
    if (role === "owner" || role === "admin" || isStaff) {
      pages.push({ value: "/app/settings/routing", label: "Routing", href: "/app/settings/routing", group: "Also" });
    }
    pages.push({ value: "/app/settings/install", label: "Install the app", href: "/app/settings/install", group: "Also" });
    return pages;
  }, [role, isStaff, workspaceRole, templateAccess, org.name]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      setNotice(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, meaning }),
      })
        .then((response) => response.json())
        .then((json: { results?: Array<{ id: string; title: string; detail: string; href: string; kind: string }>; limited?: boolean }) => {
          setRemote(
            (json.results ?? []).map((row) => ({
              value: `${row.kind}:${row.id}`,
              label: row.title,
              href: row.href,
              group: row.kind === "tasks" ? "Tasks" : "Leads",
            }))
          );
          setNotice(json.limited ? "Search by meaning is paused for an hour." : meaning ? "Search by meaning" : null);
        })
        .catch(() => setRemote([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, meaning]);

  const shown = useMemo(() => [...remote, ...items], [remote, items]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Search"
          aria-keyshortcuts="Meta+J Control+J"
        >
          <Search className="size-4" aria-hidden />
        </Button>
      </CommandDialogTrigger>
      <CommandDialogPopup>
        <CommandDialogTitle>Search</CommandDialogTitle>
        <Command items={shown} value={query} onValueChange={(value) => setQuery(value)}>
          <CommandInput placeholder="Search leads, tasks, and pages" />
          <label className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={meaning} onChange={(event) => setMeaning(event.target.checked)} />
            Search leads by meaning
          </label>
          {notice ? <p className="px-3 text-xs text-muted-foreground">{notice}</p> : null}
          <CommandEmpty>Nothing matched.</CommandEmpty>
          <CommandList>
            {(item) => (
              <CommandItem
                key={item.value}
                value={item}
                onClick={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
              >
                {item.label}
                <CommandShortcut>{item.group}</CommandShortcut>
              </CommandItem>
            )}
          </CommandList>
          <CommandFooter>
            <span>Jump</span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>J</Kbd>
            </KbdGroup>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
