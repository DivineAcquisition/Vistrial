"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RiNotification3Line,
  RiSearchLine,
  RiAddLine,
  RiFileTextLine,
  RiCalendarLine,
  RiTeamLine,
  RiCheckLine,
  RiMessage2Line,
  RiArrowRightLine,
  RiDashboardLine,
  RiLineChartLine,
  RiSettings4Line,
  RiCloseLine,
} from "@remixicon/react";
import { UserMenu } from "@/components/auth/user-menu";
import type { User } from "@supabase/supabase-js";

interface HeaderProps {
  user: User;
  business: {
    name: string;
    logo_url?: string;
  };
}

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  shortcut: string;
}

interface NavigationItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const quickActions: QuickAction[] = [
  { label: "New Quote", icon: RiFileTextLine, href: "/quotes/new", shortcut: "Q" },
  { label: "New Booking", icon: RiCalendarLine, href: "/bookings/new", shortcut: "B" },
  { label: "New Customer", icon: RiTeamLine, href: "/customers/new", shortcut: "C" },
];

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", icon: RiDashboardLine, href: "/dashboard" },
  { label: "Quotes", icon: RiFileTextLine, href: "/quotes" },
  { label: "Bookings", icon: RiCalendarLine, href: "/bookings" },
  { label: "Customers", icon: RiTeamLine, href: "/customers" },
  { label: "Analytics", icon: RiLineChartLine, href: "/analytics" },
  { label: "Settings", icon: RiSettings4Line, href: "/settings" },
];

export function DashboardHeader({ user, business }: HeaderProps) {
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + K for search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      // Escape to close
      if (e.key === "Escape") {
        setCommandOpen(false);
        setCreateOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredActions = quickActions.filter((action) =>
    action.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredNavigation = navigationItems.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = useCallback(
    (href: string) => {
      router.push(href);
      setCommandOpen(false);
      setSearchQuery("");
    },
    [router]
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:px-6 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
        {/* Left: Search */}
        <div className="flex-1 max-w-md ml-12 lg:ml-0">
          <button
            onClick={() => setCommandOpen(true)}
            className="w-full flex items-center gap-2 h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-500 text-sm transition-colors"
          >
            <RiSearchLine className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="ml-auto hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-500 font-medium bg-white/5 border border-white/10">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Mobile Search */}
          <button
            onClick={() => setCommandOpen(true)}
            className="md:hidden p-2.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
          >
            <RiSearchLine className="w-5 h-5" />
          </button>

          {/* Create Dropdown */}
          <div className="relative">
            <button
              onClick={() => setCreateOpen(!createOpen)}
              className="flex items-center gap-1.5 h-9 px-3 md:px-4 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-all shadow-sm shadow-brand-500/20 hover:shadow-md hover:shadow-brand-500/30"
            >
              <RiAddLine className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium">Create</span>
            </button>

            {createOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setCreateOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-48 py-2 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">
                    Quick Actions
                  </div>
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => {
                        router.push(action.href);
                        setCreateOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <action.icon className="w-4 h-4 text-gray-500" />
                      {action.label}
                      <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-white/5 rounded text-gray-500">
                        {action.shortcut}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
            >
              <RiNotification3Line className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
              </span>
            </button>

            {notificationsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNotificationsOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <span className="text-sm font-semibold text-white">
                      Notifications
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-brand-500/20 text-brand-400 rounded">
                      3 new
                    </span>
                  </div>
                  <div className="divide-y divide-white/5">
                    <div className="flex items-start gap-3 p-4 hover:bg-white/5 cursor-pointer transition-colors">
                      <div className="p-1.5 rounded-full bg-green-500/20 text-green-400">
                        <RiCheckLine className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">
                          Quote Won
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          John Doe accepted your quote
                        </p>
                        <p className="text-xs text-gray-600 mt-1">2 min ago</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 hover:bg-white/5 cursor-pointer transition-colors">
                      <div className="p-1.5 rounded-full bg-blue-500/20 text-blue-400">
                        <RiMessage2Line className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">
                          New Message
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          Jane replied to your follow-up
                        </p>
                        <p className="text-xs text-gray-600 mt-1">15 min ago</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-2 border-t border-white/10">
                    <button className="w-full text-center py-2 text-sm text-brand-400 hover:text-brand-300 transition-colors">
                      View all notifications
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User menu */}
          <UserMenu user={user} business={business} />
        </div>
      </header>

      {/* Command Palette */}
      {commandOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setCommandOpen(false);
              setSearchQuery("");
            }}
          />
          <div className="relative w-full max-w-lg bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 border-b border-white/10">
              <RiSearchLine className="w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search or jump to..."
                className="flex-1 py-4 bg-transparent text-white placeholder-gray-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={() => {
                  setCommandOpen(false);
                  setSearchQuery("");
                }}
                className="p-1 text-gray-500 hover:text-white transition-colors"
              >
                <RiCloseLine className="w-5 h-5" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto py-2">
              {filteredActions.length > 0 && (
                <div className="px-2 py-2">
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">
                    Quick Actions
                  </div>
                  {filteredActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSelect(action.href)}
                      className="w-full flex items-center gap-3 px-2 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <action.icon className="w-4 h-4 text-gray-500" />
                      {action.label}
                      <RiArrowRightLine className="w-4 h-4 ml-auto text-gray-600" />
                    </button>
                  ))}
                </div>
              )}

              {filteredNavigation.length > 0 && (
                <div className="px-2 py-2 border-t border-white/5">
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">
                    Navigation
                  </div>
                  {filteredNavigation.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleSelect(item.href)}
                      className="w-full flex items-center gap-3 px-2 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <item.icon className="w-4 h-4 text-gray-500" />
                      {item.label}
                      <RiArrowRightLine className="w-4 h-4 ml-auto text-gray-600" />
                    </button>
                  ))}
                </div>
              )}

              {filteredActions.length === 0 && filteredNavigation.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-500">
                  No results found for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-xs text-gray-600">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10">
                    ↑
                  </kbd>
                  <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10">
                    ↓
                  </kbd>
                  <span className="ml-1">Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10">
                    ↵
                  </kbd>
                  <span className="ml-1">Select</span>
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10">
                  esc
                </kbd>
                <span className="ml-1">Close</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
