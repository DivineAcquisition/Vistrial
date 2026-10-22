"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompassIcon, SearchIcon } from "lucide-react";

import { commandSuggestionsAction } from "@/app/(workspace)/app/home/workspace-actions";
import { useOrg } from "@/components/app/org-provider";
import { IntentSelector } from "@/components/agent-elements/intent-selector";
import { COMPASS_OPEN_EVENT, type CompassOpenDetail } from "@/components/compass/panel";
import { OPERATOR_OPEN_RUN_EVENT, type OperatorOpenDetail } from "@/components/operator/open-run-button";
import { AGENT_INTENT_COPY, type AgentIntent } from "@/lib/agent-elements/intent";
import { Command, CommandDialog, CommandDialogPopup, CommandDialogTitle, CommandEmpty, CommandFooter, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { MORE_NAV, PRIMARY_NAV, navVisibleTo } from "@/lib/navigation";
import { shellNavigation } from "@/lib/shell/nav";
import { COMMAND_COPY } from "@/lib/workspace/voice";
import { cn } from "@/lib/utils";

type Item = { value: string; label: string; group: string; href?: string; ask?: string };

export const COMMAND_OPEN_EVENT = "vistrial:command";
export type CommandOpenDetail = { query?: string };

function askVistrial(question: string, intent: AgentIntent) {
  if (intent === "propose") {
    window.dispatchEvent(new CustomEvent<OperatorOpenDetail>(OPERATOR_OPEN_RUN_EVENT, { detail: { request: question, intent } }));
    return;
  }
  window.dispatchEvent(new CustomEvent<CompassOpenDetail>(COMPASS_OPEN_EVENT, { detail: { question, send: true, intent } }));
}

function askLabel(intent: AgentIntent, question: string): string {
  if (intent === "propose") return `Propose: "${question}"`;
  if (intent === "draft") return `Draft: "${question}"`;
  return COMMAND_COPY.ask(question);
}

/**
 * One bar for search, questions, and requests. Leads and pages come from the
 * same search the jump palette used (row security decides which leads);
 * anything else goes to Compass, which only suggests and waits for a tap.
 */
export function CommandBarDialog() {
  const [open, setOpenState] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const asked = useRef(false);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (next && !asked.current) {
      asked.current = true;
      void commandSuggestionsAction()
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }
  }, []);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<AgentIntent>("lookup");
  const [remote, setRemote] = useState<Item[]>([]);
  const router = useRouter();
  const { role, isStaff, workspaceRole, templateAccess, org } = useOrg();

  const pages = useMemo<Item[]>(() => {
    const shell = shellNavigation({ role: workspaceRole, templateAccess, workspaceName: org.name });
    const seen = new Set<string>();
    const out: Item[] = [];
    const push = (href: string, label: string) => {
      if (seen.has(href)) return;
      seen.add(href);
      out.push({ value: `page:${href}`, label, href, group: COMMAND_COPY.groups.pages });
    };
    for (const group of shell.groups) for (const item of group.items) for (const entry of [item, ...(item.children ?? [])]) push(entry.href, entry.label);
    for (const item of [...PRIMARY_NAV, ...MORE_NAV]) if (navVisibleTo(item, role, isStaff)) push(item.href, item.label);
    push("/app/tasks", "Tasks");
    return out;
  }, [role, isStaff, workspaceRole, templateAccess, org.name]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k")) {
        event.preventDefault();
        setOpen(true);
      }
    }
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<CommandOpenDetail>).detail;
      setQuery(detail?.query ?? "");
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_OPEN_EVENT, onOpen);
    };
  }, [setOpen]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const handle = window.setTimeout(() => {
      void fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, meaning: false }) })
        .then((response) => response.json())
        .then((json: { results?: Array<{ id: string; title: string; href: string; kind: string }> }) =>
          setRemote(
            (json.results ?? []).map((row) => ({
              value: `${row.kind}:${row.id}`,
              label: row.title,
              href: row.href,
              group: row.kind === "tasks" ? COMMAND_COPY.groups.tasks : COMMAND_COPY.groups.leads,
            }))
          )
        )
        .catch(() => setRemote([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const q = query.trim();
  const shown = useMemo<Item[]>(() => {
    if (!q) return (suggestions ?? []).map((text) => ({ value: `suggest:${text}`, label: text, ask: text, group: COMMAND_COPY.groups.suggested }));
    const lower = q.toLowerCase();
    const matchingPages = pages.filter((page) => page.label.toLowerCase().includes(lower)).slice(0, 6);
    return [...(q.length >= 2 ? remote : []), ...matchingPages, { value: `ask:${q}`, label: askLabel(intent, q), ask: q, group: COMMAND_COPY.groups.ask }];
  }, [q, remote, pages, suggestions, intent]);

  function choose(item: Item) {
    setOpen(false);
    if (item.ask) askVistrial(item.ask, intent);
    else if (item.href) router.push(item.href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup>
        <CommandDialogTitle>{COMMAND_COPY.placeholder}</CommandDialogTitle>
        <Command items={shown} value={query} onValueChange={(value) => setQuery(value)} filter={null}>
          <CommandInput placeholder={COMMAND_COPY.placeholder} />
          <CommandEmpty>{COMMAND_COPY.empty}</CommandEmpty>
          <CommandList>
            {(item: Item) => (
              <CommandItem key={item.value} value={item} onClick={() => choose(item)}>
                {item.ask ? <CompassIcon aria-hidden className="size-4 text-brand-300" /> : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <CommandShortcut>{item.group}</CommandShortcut>
              </CommandItem>
            )}
          </CommandList>
          <CommandFooter>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <IntentSelector value={intent} onChange={setIntent} />
              <span>{intent === "lookup" ? COMMAND_COPY.footer : AGENT_INTENT_COPY[intent].description}</span>
            </div>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function openCommand(query?: string) {
  window.dispatchEvent(new CustomEvent<CommandOpenDetail>(COMMAND_OPEN_EVENT, { detail: { query } }));
}

/** The control in the top bar on every page. */
export function CommandBarTrigger() {
  return (
    <button
      type="button"
      onClick={() => openCommand()}
      aria-label={COMMAND_COPY.placeholder}
      aria-keyshortcuts="Meta+K Control+K"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-sm text-muted-foreground hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <SearchIcon aria-hidden className="size-4" />
      <span className="hidden md:inline">{COMMAND_COPY.placeholderShort}</span>
    </button>
  );
}

/** The expanded bar at the top of the workspace. Same dialog, larger target. */
export function CommandBarField({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openCommand()}
      onKeyDown={(event) => {
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          openCommand(event.key);
        }
      }}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-left text-sm text-muted-foreground hover:border-white/[0.14] focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <SearchIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{COMMAND_COPY.placeholder}</span>
      <KbdGroup className="hidden sm:inline-flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </button>
  );
}
