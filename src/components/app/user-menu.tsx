"use client";

import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrg } from "@/components/app/org-provider";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { user, role, isPlatformAdmin, org } = useOrg();
  const name = user.displayName || user.email;
  const roleLabel = isPlatformAdmin ? "Super admin" : role;

  const trigger = (
    <DropdownMenuTrigger
      aria-label={collapsed ? `Account: ${name}` : undefined}
      className={cn(
        "flex w-full items-center rounded-xl text-left transition-colors hover:bg-white/[0.05]",
        collapsed ? "justify-center p-2" : "gap-2.5 px-2 py-2"
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
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm text-white">{name}</span>
          <span className="block truncate text-xs text-dim">{user.email}</span>
          {collapsed ? (
            <span className="mt-1 block truncate text-xs text-dim">{org.name}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings/profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/auth/signout">Sign out</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
