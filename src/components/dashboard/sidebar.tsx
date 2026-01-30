"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";

interface SidebarProps {
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
  };
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: RiDashboardLine },
  { name: "Bookings", href: "/bookings", icon: RiCalendarLine },
  { name: "Customers", href: "/customers", icon: RiTeamLine },
  { name: "Memberships", href: "/memberships", icon: RiVipCrownLine },
  { name: "Quotes", href: "/quotes", icon: RiFileTextLine },
];

const secondaryNav = [
  { name: "Settings", href: "/settings", icon: RiSettings4Line },
  { name: "Help", href: "/help", icon: RiQuestionLine },
];

export function DashboardSidebar({ business }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const bookingUrl = `book.vistrial.io/${business.slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(`https://${bookingUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image
            src="/Untitled design (2).png"
            alt="Vistrial"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <Image
            src="/VISTRIAL.png"
            alt="Vistrial"
            width={100}
            height={28}
            className="h-7 w-auto"
          />
        </Link>
      </div>

      {/* Business info */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt=""
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900/30 rounded-lg flex items-center justify-center">
              <span className="text-brand-600 dark:text-brand-400 font-semibold text-lg">
                {business.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-50 truncate">{business.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{bookingUrl}</p>
          </div>
        </div>

        {/* Booking link actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <RiCheckLine className="w-4 h-4 text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <RiFileCopyLine className="w-4 h-4" />
                <span>Copy Link</span>
              </>
            )}
          </button>
          <a
            href={`https://${bookingUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RiExternalLinkLine className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-50"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-1">
        {secondaryNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-50"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:bg-white dark:lg:bg-gray-900 lg:border-r lg:border-gray-200 dark:lg:border-gray-800">
        <SidebarContent />
      </aside>

      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white dark:bg-gray-900 rounded-lg shadow-md"
      >
        <RiMenuLine className="w-6 h-6" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileOpen(false)}
          />

          {/* Sidebar */}
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1"
            >
              <RiCloseLine className="w-6 h-6" />
            </button>
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  );
}
