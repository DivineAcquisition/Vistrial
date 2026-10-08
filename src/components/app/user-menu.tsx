"use client";

import Link from "next/link";
import { useRef } from "react";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrg } from "@/components/app/org-provider";
import { initials } from "@/lib/format";
import { SHELL_ROLE_LABEL } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

export function UserMenu({
  collapsed = false,
  placement = "sidebar",
}: {
  collapsed?: boolean;
  placement?: "sidebar" | "header";
}) {
  const { user, isStaff, isPlatformAdmin, workspaceRole, org } = useOrg();
  const name = user.displayName || user.email;
  const roleLabel = SHELL_ROLE_LABEL[workspaceRole];
  const header = placement === "header";
  const signOutRef = useRef<HTMLFormElement>(null);

  const trigger = (
    <MenuTrigger
      aria-label={collapsed ? `Account: ${name}` : undefined}
      className={cn(
        "flex items-center rounded-lg text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        header
          ? "min-h-10 gap-2.5 px-2.5 py-2"
          : collapsed
            ? "w-full justify-center p-2"
            : "w-full gap-2.5 px-2 py-2"
      )}
    >
      <Avatar size="sm">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-card-foreground">{name}</span>
          <span className="block truncate text-[11px] text-dim">{roleLabel}</span>
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
            <span className="block truncate text-sm text-card-foreground">{name}</span>
            <span className="block truncate text-xs text-dim">{user.email}</span>
            {collapsed ? (
              <span className="mt-1 block truncate text-xs text-dim">{org.name}</span>
            ) : null}
          </MenuGroupLabel>
        </MenuGroup>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/app/settings/profile" />}>Personal settings</MenuLinkItem>
        {isStaff ? (
          <MenuLinkItem render={<Link href="/app/team" />}>Vistrial team</MenuLinkItem>
        ) : null}
        {isPlatformAdmin ? (
          <MenuLinkItem render={<Link href="/app/ops" />}>System</MenuLinkItem>
        ) : null}
        <MenuItem onClick={() => signOutRef.current?.requestSubmit()}>Sign out</MenuItem>
      </MenuPopup>
      <SignOutForm ref={signOutRef} className="hidden" />
    </Menu>
  );
}
