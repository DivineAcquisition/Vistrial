"use client";

import Link from "next/link";

import { Building2, Check, ChevronsUpDownIcon, LayoutGrid as Layers, Settings, User, Users } from "@/components/icons";
import { useWorkspaceShell, type ScopeChoice, type ShellClient } from "@/components/shell/shell-context";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

export type ClientPickerProps = {
  organizationName: string;
  clients: ShellClient[];
  /** Whether "<Organization> itself" is a choice for this person. */
  ownWork: boolean;
  canManage: boolean;
  choice: ScopeChoice;
  onChoose: (choice: ScopeChoice) => void;
  onNavigate?: () => void;
};

const item = "flex size-6 shrink-0 items-center justify-center rounded-md bg-overlay/[0.06] text-muted-foreground";

/**
 * The client picker, under the organization selector: all clients, the organization itself, or one
 * client. Everything on screen filters to the choice, and new work is made for it.
 */
export function ClientPickerView({ organizationName, clients, ownWork, canManage, choice, onChoose, onNavigate }: ClientPickerProps) {
  const chosen = clients.find((row) => row.id === choice);
  const label = choice === "all" ? "All clients" : choice === "own" ? `${organizationName} itself` : (chosen?.name ?? "All clients");
  const hint =
    choice === "all"
      ? clients.length === 0
        ? "No clients yet"
        : `${clients.length} ${clients.length === 1 ? "client" : "clients"}${ownWork ? " and your own work" : ""}`
      : choice === "own"
        ? "Your organization's own work"
        : chosen?.type === "person"
          ? "Client · person"
          : "Client · business";
  const pick = (next: ScopeChoice) => {
    onChoose(next);
    onNavigate?.();
  };
  const Icon = choice === "all" ? Layers : choice === "own" ? Building2 : chosen?.type === "person" ? User : Users;
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={`Showing: ${label}. Choose a client`}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
              choice === "all" ? "border-border" : "border-primary/40 bg-primary/[0.06]",
            )}
          />
        }
      >
        <Icon aria-hidden className={cn("size-4 shrink-0", choice === "all" ? "text-muted-foreground" : "text-primary")} />
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm text-foreground">{label}</span>
          <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="start" className="max-h-[70dvh] min-w-64 overflow-y-auto">
        <MenuGroup>
          <MenuGroupLabel>Show</MenuGroupLabel>
          <MenuItem onClick={() => pick("all")}>
            <span aria-hidden className={item}>
              <Layers className="size-3.5" />
            </span>
            <span className="flex-1">All clients</span>
            {choice === "all" ? <Check aria-label="Chosen" className="size-4 shrink-0 text-primary" /> : null}
          </MenuItem>
          {ownWork ? (
            <MenuItem onClick={() => pick("own")}>
              <span aria-hidden className={item}>
                <Building2 className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{organizationName} itself</span>
              {choice === "own" ? <Check aria-label="Chosen" className="size-4 shrink-0 text-primary" /> : null}
            </MenuItem>
          ) : null}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Clients</MenuGroupLabel>
          {clients.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{canManage ? "Add the businesses and people you work for." : "You have not been given a client yet. An Owner or Admin assigns them."}</p>
          ) : (
            clients.map((client) => (
              <MenuItem key={client.id} onClick={() => pick(client.id)}>
                <span aria-hidden className={item}>
                  {client.type === "person" ? <User className="size-3.5" /> : <Users className="size-3.5" />}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{client.name}</span>
                  {client.line ? <span className="truncate text-xs text-muted-foreground">{client.line}</span> : null}
                </span>
                {choice === client.id ? <Check aria-label="Chosen" className="size-4 shrink-0 text-primary" /> : null}
              </MenuItem>
            ))
          )}
        </MenuGroup>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/app/clients" onClick={onNavigate} />}>
          <Settings aria-hidden /> {canManage ? "Manage clients" : "Your clients"}
        </MenuLinkItem>
      </MenuPopup>
    </Menu>
  );
}

/** The picker wired to the open organization. */
export function ClientPicker({ organizationName, onNavigate }: { organizationName: string; onNavigate?: () => void }) {
  const shell = useWorkspaceShell();
  if (!shell?.clients || !shell.setChoice) return null;
  return (
    <ClientPickerView
      organizationName={shell.organizations?.find((row) => row.workspaceId === shell.workspaceId)?.name ?? organizationName}
      clients={shell.clients}
      ownWork={shell.ownWork ?? true}
      canManage={shell.canManageClients ?? false}
      choice={shell.choice ?? "all"}
      onChoose={shell.setChoice}
      onNavigate={onNavigate}
    />
  );
}
