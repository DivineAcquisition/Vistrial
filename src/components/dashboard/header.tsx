"use client";

import { RiNotification3Line, RiSearchLine } from "@remixicon/react";
import { UserMenu } from "@/components/auth/user-menu";
import type { User } from "@supabase/supabase-js";

interface HeaderProps {
  user: User;
  business: {
    name: string;
    logo_url?: string;
  };
}

export function DashboardHeader({ user, business }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-transparent rounded-lg text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-900 focus:border-gray-200 dark:focus:border-gray-700 transition-all"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button className="relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <RiNotification3Line className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* User menu */}
          <UserMenu user={user} business={business} />
        </div>
      </div>
    </header>
  );
}
