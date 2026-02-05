// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  RiUserLine,
  RiSettings4Line,
  RiLogoutBoxLine,
  RiArrowDownSLine,
} from "@remixicon/react";
import { signOut } from "@/lib/auth/actions";
import type { User } from "@supabase/supabase-js";

interface UserMenuProps {
  user: User;
  business?: {
    name?: string;
    logo_url?: string;
  } | null;
}

export function UserMenu({ user, business }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const userEmail = user.email || "";

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {business?.logo_url ? (
          <img
            src={business.logo_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 bg-brand-100 dark:bg-brand-900/30 rounded-full flex items-center justify-center">
            <RiUserLine className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          </div>
        )}
        <div className="text-left hidden sm:block">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{displayName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{business?.name}</p>
        </div>
        <RiArrowDownSLine className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 py-1 z-50">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{displayName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userEmail}</p>
          </div>

          <div className="py-1">
            <Link
              href="/settings/general"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => setOpen(false)}
            >
              <RiSettings4Line className="w-4 h-4" />
              Settings
            </Link>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 py-1">
            <form action={signOut}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <RiLogoutBoxLine className="w-4 h-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
