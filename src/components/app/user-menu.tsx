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
import { useOrg } from "@/components/app/org-provider";
import { initials } from "@/lib/format";

export function UserMenu() {
  const { user, role, isPlatformAdmin } = useOrg();
  const name = user.displayName || user.email;
  const roleLabel = isPlatformAdmin ? "Super admin" : role;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/[0.04]">
        <Avatar size="sm">
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-white">{name}</span>
          <span className="block truncate text-[11px] capitalize text-dim">{roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isPlatformAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/ops">Staff console</Link>
          </DropdownMenuItem>
        ) : null}
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
