"use client";

import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrg } from "@/components/app/org-provider";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserMenu({
  collapsed = false,
  placement = "sidebar",
}: {
  collapsed?: boolean;
  placement?: "sidebar" | "header";
}) {
  const { user, role, isPlatformAdmin, org } = useOrg();
  const name = user.displayName || user.email;
  const roleLabel = isPlatformAdmin ? "Super admin" : role;
  const header = placement === "header";

  const trigger = (
    <MenuTrigger
      aria-label={collapsed ? `Account: ${name}` : undefined}
      className={cn(
        "flex items-center rounded-xl text-left transition-colors hover:bg-white/[0.05]",
        header ? "gap-2.5 px-2 py-1.5" : collapsed ? "w-full justify-center p-2" : "w-full gap-2.5 px-2 py-2"
      )}
    >
      <Avatar size="sm">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-white">{name}</span>
          <span className="block truncate text-[11px] text-dim capitalize">{roleLabel}</span>
        </span>
      )}
    </MenuTrigger>
  );

  return (
    <Menu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <MenuPopup
        align={header ? "end" : "start"}
        side={header ? "bottom" : "top"}
        className="w-56"
      >
        <MenuGroup>
          <MenuGroupLabel className="font-normal">
            <span className="block truncate text-sm text-white">{name}</span>
            <span className="block truncate text-xs text-dim">{user.email}</span>
            {collapsed ? (
              <span className="mt-1 block truncate text-xs text-dim">{org.name}</span>
            ) : null}
          </MenuGroupLabel>
        </MenuGroup>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/app/settings/profile" />}>Profile</MenuLinkItem>
        <MenuLinkItem render={<Link href="/auth/signout" />}>Sign out</MenuLinkItem>
      </MenuPopup>
    </Menu>
  );
}
