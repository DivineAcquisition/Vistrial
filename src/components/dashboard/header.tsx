"use client";

import { Bell, Search } from "lucide-react";
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
    <header className="sticky top-0 z-30 bg-white border-b px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-transparent rounded-lg text-sm focus:outline-none focus:bg-white focus:border-slate-200 transition-all"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* User menu */}
          <UserMenu user={user} business={business} />
        </div>
      </div>
    </header>
  );
}
