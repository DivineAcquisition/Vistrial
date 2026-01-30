"use client";

import { RiMenuLine, RiNotification3Line } from "@remixicon/react";
import { UserMenu } from "@/components/auth/user-menu";
import type { User } from "@supabase/supabase-js";

interface HeaderProps {
  user: User;
  business?: {
    name?: string;
    logo_url?: string;
  } | null;
  onMenuClick?: () => void;
}

export function Header({ user, business, onMenuClick }: HeaderProps) {
  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 lg:px-6">
      {/* Left: Mobile menu button */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <RiMenuLine className="h-5 w-5 text-gray-500" />
        </button>
        
        {/* Page title - can be customized per page */}
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50 hidden sm:block">
          {business?.name ?? "Dashboard"}
        </h1>
      </div>

      {/* Right: Notifications & User */}
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 relative">
          <RiNotification3Line className="h-5 w-5 text-gray-500" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
        </button>
        
        <UserMenu user={user} business={business} />
      </div>
    </header>
  );
}
