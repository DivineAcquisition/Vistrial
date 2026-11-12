"use client";

import { useAction, useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { Check, ChevronsUpDownIcon, Plus, Settings, Wallet, type LucideIcon } from "@/components/icons";
import { useWorkspaceShell, type ShellAccount, type ShellOrganization } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ROLE_LABEL } from "@/lib/roles";
import { describeError } from "@/lib/errors/user-error";
import { creditWords, dollarWords } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

function Mark({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/12 font-heading text-primary", className)}>
      {name.trim().charAt(0).toUpperCase() || "V"}
    </span>
  );
}

export type OrganizationSwitcherProps = {
  /** The open organization's name. */
  name: string;
  current: string | null;
  organizations: ShellOrganization[];
  account: ShellAccount | null;
  onSwitch: (workspaceId: ShellOrganization["workspaceId"]) => void;
  /** Resolves with nothing when the organization was added, or with why it was not. */
  onAdd: (name: string) => Promise<string | null>;
  onNavigate?: () => void;
};

/**
 * The organization selector at the top of the sidebar: which of the owner's businesses is open, the others
 * this person can open, and (for an Owner) adding one. Everything on screen belongs to the open one.
 */
export function OrganizationSwitcherView({ name, current, organizations, account, onSwitch, onAdd, onNavigate }: OrganizationSwitcherProps) {
  const [adding, setAdding] = useState(false);
  const links: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/app/settings", label: "Settings", icon: Settings },
    { href: "/app/billing", label: "Billing", icon: Wallet },
  ];
  const role = organizations.find((row) => row.workspaceId === current)?.role;
  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`Organization: ${name}. Open the organization menu`}
              className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <Mark name={name} className="size-8 text-sm" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-heading text-sm text-foreground">{name}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {organizations.length > 1 ? `Organization · 1 of ${organizations.length}` : "Organization"}
              {role ? ` · ${ROLE_LABEL[role]}` : ""}
            </span>
          </span>
          <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </MenuTrigger>
        <MenuPopup align="start" className="min-w-64">
          <MenuGroup>
          <MenuGroupLabel>{account && organizations.length > 1 ? `${account.name} · organizations` : "Organizations"}</MenuGroupLabel>
          {organizations.map((organization) => {
            const open = organization.workspaceId === current;
            return (
              <MenuItem
                key={organization.workspaceId}
                onClick={() => {
                  if (!open) onSwitch(organization.workspaceId);
                  onNavigate?.();
                }}
              >
                <Mark name={organization.name} className="size-6 rounded-md text-xs" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{organization.name}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABEL[organization.role]}</span>
                </span>
                {open ? <Check aria-label="Open now" className="size-4 shrink-0 text-primary" /> : null}
              </MenuItem>
            );
          })}
          {account?.owner ? (
            <MenuItem onClick={() => setAdding(true)}>
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                <Plus className="size-3.5" />
              </span>
              <span className="grid">
                <span>Add an organization</span>
                <span className="text-xs text-muted-foreground">Another business of yours</span>
              </span>
            </MenuItem>
          ) : null}
          </MenuGroup>
          <MenuSeparator />
          {links.map((item) => (
            <MenuLinkItem key={item.href} render={<Link href={item.href} onClick={onNavigate} />}>
              <item.icon aria-hidden /> {item.label}
            </MenuLinkItem>
          ))}
        </MenuPopup>
      </Menu>
      <AddOrganizationDialog open={adding} onOpenChange={setAdding} account={account} onAdd={onAdd} />
    </>
  );
}


/**
 * Adding an organization. Where it is paid for, the price is stated before anything happens and the Owner
 * ticks that they agree to it: nothing is charged, and nothing is created, without that.
 */
export function AddOrganizationDialog({
  open,
  onOpenChange,
  account,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ShellAccount | null;
  onAdd: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = account ? !account.canAdd : true;
  const price = account?.addPrice ?? null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setName("");
          setAgreed(false);
          setProblem(null);
        }
      }}
    >
      <DialogPopup className="p-5 sm:p-6">
        <DialogTitle className="font-heading text-lg">Add an organization</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          An organization is one of your own businesses: an agency, a coaching brand, a product you sell. It gets its own team, agents, connections and
          clients. Credits are shared across your account.
        </p>
        {closed ? (
          <p className="mt-4 rounded-xl border border-border bg-overlay/[0.03] px-3 py-2 text-sm text-foreground">
            {account?.addClosedReason ?? "Only an Owner of the account can add an organization."}
          </p>
        ) : (
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setProblem(null);
              void onAdd(name).then((result) => {
                setBusy(false);
                if (result) setProblem(result);
                else onOpenChange(false);
              });
            }}
          >
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Northlight Coaching" />
            </label>
            {price ? (
              <div className="grid gap-2 rounded-xl border border-primary/30 bg-primary/[0.05] p-3">
                <p className="text-sm text-foreground">
                  <span className="font-heading text-2xl">{dollarWords(price.priceCents)}</span>
                  <span className="text-muted-foreground"> a month, added to your plan</span>
                </p>
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  <li>Adds {creditWords(price.includedCents)} to your shared balance every month.</li>
                  <li>Charged today for the rest of this billing period, then with each renewal.</li>
                  <li>Clients inside it are not charged for.</li>
                </ul>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-primary" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                  <span>I agree to add {dollarWords(price.priceCents)} a month to this account.</span>
                </label>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              You and the account&apos;s other Owners can open it straight away. Nobody else can until you give them a role in it under Settings, People.
            </p>
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim() || (price !== null && !agreed)}>
                {busy ? "Adding…" : price ? `Add and pay ${dollarWords(price.priceCents)} a month` : "Add organization"}
              </Button>
            </div>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Adds an organization for the open account: through billing where it is paid for (the price the Owner
 * agreed to is sent with the request, so a changed price is refused), directly where nothing is charged.
 * Resolves with nothing when it was added or the person was sent to pay, or with why it was not.
 */
export function useAddOrganization() {
  const shell = useWorkspaceShell();
  const create = useMutation(api.organizations.create);
  const buy = useAction(api.billingActions.addOrganization);
  const account = shell?.account ?? null;
  return async (newName: string): Promise<string | null> => {
    if (!shell || !account) return "Only an Owner of the account can add an organization.";
    try {
      if (account.addPrice) {
        const result = await buy({ workspaceId: shell.workspaceId, name: newName, confirmedCents: account.addPrice.priceCents, returnOrigin: window.location.origin });
        if (result.url) window.location.assign(result.url);
        else if (result.workspaceId) shell.switchOrganization?.(result.workspaceId);
        return null;
      }
      shell.switchOrganization?.(await create({ accountId: account.accountId, name: newName }));
      return null;
    } catch (problem) {
      return describeError(problem, "The organization could not be added. Try again.").message;
    }
  };
}

/** The selector wired to the signed-in person's organizations. */
export function OrganizationSwitcher({ name, onNavigate }: { name: string; onNavigate?: () => void }) {
  const shell = useWorkspaceShell();
  const add = useAddOrganization();
  // A shell without the list (a story, or a moment before it loads) still shows the organization that is open.
  const organizations: ShellOrganization[] =
    shell?.organizations ?? (shell ? [{ workspaceId: shell.workspaceId, name, role: shell.role, accountId: null }] : []);
  const account = shell?.account ?? null;
  return (
    <OrganizationSwitcherView
      name={organizations.find((row) => row.workspaceId === shell?.workspaceId)?.name ?? name}
      current={shell?.workspaceId ?? null}
      organizations={organizations}
      account={account}
      onSwitch={(workspaceId) => shell?.switchOrganization?.(workspaceId)}
      onAdd={add}
      onNavigate={onNavigate}
    />
  );
}
