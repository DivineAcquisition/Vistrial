"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { useShellSwitch } from "@/components/app/shell-switch";
import { Input } from "@/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import { switchOrg } from "@/lib/auth/actions";
import { workspaceStatus } from "@/lib/workspaces/status";
import { cn } from "@/lib/utils";

/**
 * The Vistrial team's switcher: every workspace this person can enter right
 * now, searchable, with its status. Customers never render it. Switching
 * reloads the page so nothing from the previous workspace stays on screen.
 */
export function WorkspaceSwitcher({ platform = false }: { platform?: boolean }) {
  const { org, memberships, isStaff } = useOrg();
  const { beginSwitch, cancelSwitch } = useShellSwitch();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memberships.filter((membership) => !q || membership.org.name.toLowerCase().includes(q));
  }, [memberships, query]);

  if (!isStaff) return null;
  const current = workspaceStatus(org.status);
  const triggerLabel = platform ? "No workspace" : org.name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex min-w-0 max-w-[10rem] items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-sm text-card-foreground hover:bg-accent sm:max-w-[18rem]"
        aria-label={platform ? "No workspace. Switch workspace" : `Workspace: ${org.name}. Switch workspace`}
        title={triggerLabel}
        disabled={pending}
      >
        <span className="truncate font-medium">{triggerLabel}</span>
        {platform ? null : <StatusBadge label={current.label} tone={current.tone} />}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-[22rem] p-2">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${memberships.length} workspaces`}
          aria-label="Search workspaces"
        />
        <ul className="mt-2 max-h-80 overflow-y-auto" role="listbox" aria-label="Workspaces">
          <li role="option" aria-selected={platform}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                platform && "bg-accent",
              )}
              onClick={() => {
                setOpen(false);
                if (platform) return;
                beginSwitch();
                router.push("/app/team");
              }}
            >
              <span className="truncate">No workspace</span>
            </button>
          </li>
          {results.length === 0 ? (
            <li className="px-2 py-3 text-sm text-dim">No workspace matches.</li>
          ) : (
            results.map((membership) => {
              const status = workspaceStatus(membership.org.status);
              const selected = membership.org.id === org.id;
              return (
                <li key={membership.org.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    disabled={pending}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                      selected && "bg-accent"
                    )}
                    onClick={() => {
                      if (selected) {
                        setOpen(false);
                        return;
                      }
                      beginSwitch();
                      startTransition(async () => {
                        const result = await switchOrg(membership.org.id);
                        if (!result.ok) {
                          cancelSwitch();
                          setError(result.error);
                          return;
                        }
                        window.location.assign(result.landing);
                      });
                    }}
                  >
                    <span className="truncate">
                      {membership.org.name}
                      {membership.org.isPlatformWorkspace ? (
                        <span className="ml-1 text-xs text-dim">· Vistrial</span>
                      ) : null}
                    </span>
                    <StatusBadge label={status.label} tone={status.tone} />
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {error ? <p className="px-2 pt-2 text-xs text-destructive">{error}</p> : null}
      </PopoverPopup>
    </Popover>
  );
}
