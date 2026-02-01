"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  RiDashboardLine,
  RiCalendarLine,
  RiTeamLine,
  RiVipCrownLine,
  RiFileTextLine,
  RiSettings4Line,
  RiQuestionLine,
  RiMenuLine,
  RiCloseLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiCheckLine,
  RiMailLine,
  RiLineChartLine,
  RiFlashlightLine,
  RiWalletLine,
  RiPlugLine,
  RiSearchLine,
  RiLogoutBoxRLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/ui/Logo";

interface SidebarProps {
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
    owner_name?: string;
  };
  user?: {
    email?: string;
  };
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  showBadge?: boolean;
}

const mainNavigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: RiDashboardLine },
  { name: "Inbox", href: "/inbox", icon: RiMailLine, showBadge: true },
];

const manageNavigation: NavItem[] = [
  { name: "Bookings", href: "/bookings", icon: RiCalendarLine },
  { name: "Quotes", href: "/quotes", icon: RiFileTextLine },
  { name: "Customers", href: "/customers", icon: RiTeamLine },
  { name: "Memberships", href: "/memberships", icon: RiVipCrownLine },
];

const engageNavigation: NavItem[] = [
  { name: "Sequences", href: "/sequences", icon: RiFlashlightLine },
];

const analyzeNavigation: NavItem[] = [
  { name: "Analytics", href: "/analytics", icon: RiLineChartLine },
];

const settingsNavigation: NavItem[] = [
  { name: "Connections", href: "/connections", icon: RiPlugLine },
  { name: "Billing", href: "/billing", icon: RiWalletLine },
  { name: "Settings", href: "/settings", icon: RiSettings4Line },
  { name: "Help", href: "/help", icon: RiQuestionLine },
];

function NavLink({
  item,
  pathname,
  unreadCount = 0,
}: {
  item: NavItem;
  pathname: string;
  unreadCount?: number;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-brand-500/10 text-brand-400"
          : "text-gray-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <div className="flex items-center gap-3">
        <item.icon
          className={cn(
            "w-5 h-5 transition-colors",
            isActive
              ? "text-brand-400"
              : "text-gray-500 group-hover:text-gray-300"
          )}
        />
        <span>{item.name}</span>
        {item.badge && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-brand-500/20 text-brand-400">
            {item.badge}
          </span>
        )}
      </div>

      {item.showBadge && unreadCount > 0 && (
        <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-semibold bg-brand-500 text-white rounded-full">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      {items.map((item) => (
        <NavLink key={item.name} item={item} pathname={pathname} />
      ))}
    </div>
  );
}

export function DashboardSidebar({ business, user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Use local path for development, subdomain in production
  const isProduction =
    typeof window !== "undefined" &&
    window.location.hostname.includes("vistrial.io");
  const bookingUrl = isProduction
    ? `book.vistrial.io/${business.slug}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/book/${business.slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(
      bookingUrl.startsWith("http") ? bookingUrl : `https://${bookingUrl}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const initials = business?.owner_name
    ? business.owner_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : business.name.charAt(0).toUpperCase();

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <Logo size="sm" />
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <button
          onClick={() => {
            // Trigger command palette
            const event = new KeyboardEvent("keydown", {
              key: "k",
              metaKey: true,
            });
            document.dispatchEvent(event);
          }}
          className="w-full flex items-center gap-2 h-9 px-3 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
        >
          <RiSearchLine className="w-4 h-4" />
          <span>Search...</span>
          <kbd className="ml-auto text-[10px] text-gray-500 font-medium px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-6 overflow-y-auto scrollbar-thin">
        <div className="space-y-1">
          {mainNavigation.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} />
          ))}
        </div>

        <NavSection label="Manage" items={manageNavigation} pathname={pathname} />
        <NavSection label="Engage" items={engageNavigation} pathname={pathname} />
        <NavSection label="Analyze" items={analyzeNavigation} pathname={pathname} />

        {/* Divider */}
        <div className="h-px bg-white/10" />

        <NavSection label="Settings" items={settingsNavigation} pathname={pathname} />
      </nav>

      {/* Booking Link Card */}
      <div className="px-3 py-2">
        <div className="p-3 rounded-xl bg-gradient-to-br from-brand-500/10 via-brand-500/5 to-purple-500/10 border border-brand-500/20">
          <div className="flex items-center gap-2 mb-2">
            <RiExternalLinkLine className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-semibold text-brand-400">
              Booking Page
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2 truncate">
            /book/{business.slug}
          </p>
          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 transition-colors"
            >
              {copied ? (
                <>
                  <RiCheckLine className="w-3 h-3 text-green-400" />
                  <span className="text-green-400">Copied</span>
                </>
              ) : (
                <>
                  <RiFileCopyLine className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <a
              href={
                bookingUrl.startsWith("http")
                  ? bookingUrl
                  : `https://${bookingUrl}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center px-2 py-1.5 text-xs bg-brand-500 hover:bg-brand-600 rounded-lg text-white transition-colors"
            >
              <RiExternalLinkLine className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* User section */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-purple-600 text-white text-xs font-semibold shadow-sm shadow-brand-500/30">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {business?.owner_name || business.name}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.email || ""}</p>
          </div>
          <button
            onClick={() => router.push("/api/auth/signout")}
            title="Sign out"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-red-400"
          >
            <RiLogoutBoxRLine className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-40 lg:hidden p-2.5 bg-gray-900 rounded-xl shadow-lg border border-white/10"
      >
        <RiMenuLine className="w-5 h-5 text-gray-300" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white z-10"
            >
              <RiCloseLine className="w-5 h-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <SidebarContent />
      </div>
    </>
  );
}
