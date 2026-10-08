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
    return pages;
  }, [role, isStaff, workspaceRole, templateAccess, org.name]);

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
        <CommandDialogTitle>Jump to a page</CommandDialogTitle>
        <Command items={items}>
          <CommandInput placeholder="Jump to a page" />
          <CommandEmpty>No matching pages.</CommandEmpty>
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
