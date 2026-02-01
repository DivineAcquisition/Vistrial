"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiDashboardLine,
  RiCalendarLine,
  RiTeamLine,
  RiVipCrownLine,
  RiFileTextLine,
  RiSettings4Line,
  RiMenuLine,
  RiCloseLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiCheckLine,
  RiFlashlightLine,
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
    settings?: Record<string, unknown>;
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
}

const mainNavigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: RiDashboardLine },
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

const settingsNavigation: NavItem[] = [
  { name: "Settings", href: "/settings/general", icon: RiSettings4Line },
];

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-brand-50 text-brand-700 border border-brand-200"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <div className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
        isActive
          ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
          : "bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-700"
      )}>
        <item.icon className="w-4 h-4" />
      </div>
      <span>{item.name}</span>
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
      {label && (
        <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
        </p>
      )}
      {items.map((item) => (
        <NavLink key={item.name} item={item} pathname={pathname} />
      ))}
    </div>
  );
}

export function DashboardSidebar({ business, user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const bookingUrl = `/book/${business.slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(
      `${typeof window !== "undefined" ? window.location.origin : ""}${bookingUrl}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ownerName = business?.owner_name || (business?.settings as any)?.owner_name || "";
  
  const initials = ownerName
    ? ownerName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (business?.name?.charAt(0) || "V").toUpperCase();

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Logo size="sm" />
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <button
          className="w-full flex items-center gap-2 h-10 px-3 text-sm bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RiSearchLine className="w-4 h-4" />
          <span>Search...</span>
          <kbd className="ml-auto text-[10px] text-gray-400 font-medium px-1.5 py-0.5 rounded bg-white border border-gray-200">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-6 overflow-y-auto">
        <div className="space-y-1">
          {mainNavigation.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} />
          ))}
        </div>

        <NavSection label="Manage" items={manageNavigation} pathname={pathname} />
        <NavSection label="Engage" items={engageNavigation} pathname={pathname} />

        {/* Divider */}
        <div className="h-px bg-gray-200" />

        <NavSection label="" items={settingsNavigation} pathname={pathname} />
      </nav>

      {/* Booking Link Card */}
      <div className="px-3 py-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/50 border border-brand-200">
          <div className="flex items-center gap-2 mb-2">
            <RiExternalLinkLine className="w-4 h-4 text-brand-600" />
            <span className="text-xs font-semibold text-brand-700">
              Booking Page
            </span>
          </div>
          <p className="text-xs text-brand-600/70 mb-2 truncate">
            /book/{business.slug}
          </p>
          <div className="flex gap-2">
            <Link
              href={bookingUrl}
              target="_blank"
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-brand-700 bg-white hover:bg-brand-50 border border-brand-200 rounded-lg py-1.5 transition-colors"
            >
              <RiExternalLinkLine className="w-3 h-3" />
              Open
            </Link>
            <button
              onClick={copyLink}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-brand-700 bg-white hover:bg-brand-50 border border-brand-200 rounded-lg py-1.5 transition-colors"
            >
              {copied ? (
                <>
                  <RiCheckLine className="w-3 h-3" />
                  Copied!
                </>
              ) : (
                <>
                  <RiFileCopyLine className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-brand-500/25">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {business.name}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Sign out"
            >
              <RiLogoutBoxRLine className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2.5 bg-white border border-gray-200 rounded-xl shadow-sm"
      >
        <RiMenuLine className="w-5 h-5 text-gray-600" />
      </button>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64">
            <SidebarContent />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
            >
              <RiCloseLine className="w-5 h-5" />
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
