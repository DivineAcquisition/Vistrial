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
    <header className="sticky top-0 z-30 bg-gray-950/50 backdrop-blur-xl border-b border-white/10 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <RiSearchLine className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Notifications */}
          <button className="relative p-2.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
            <RiNotification3Line className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full ring-2 ring-gray-950" />
          </button>

          {/* User menu */}
          <UserMenu user={user} business={business} />
        </div>
      </div>
    </header>
  );
}
