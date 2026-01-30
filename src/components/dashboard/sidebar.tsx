"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiDashboardLine,
  RiCalendarLine,
  RiTeamLine,
  RiVipCrownLine,
  RiFileTextLine,
  RiSettings4Line,
  RiLinksLine,
} from "@remixicon/react";
import { Logo, LogoIcon } from "@/components/auth/logo";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";

interface SidebarProps {
  business?: {
    slug?: string;
    business_slug?: string;
    name?: string;
  };
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: RiDashboardLine },
  { name: "Bookings", href: "/bookings", icon: RiCalendarLine },
  { name: "Customers", href: "/customers", icon: RiTeamLine },
  { name: "Memberships", href: "/memberships", icon: RiVipCrownLine },
  { name: "Quotes", href: "/quotes", icon: RiFileTextLine },
  { name: "Settings", href: "/settings/general", icon: RiSettings4Line },
];

export function Sidebar({ business }: SidebarProps) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  
  const slug = business?.slug || business?.business_slug || "your-business";
  const bookingUrl = `book.vistrial.io/${slug}`;

  const copyBookingLink = async () => {
    await navigator.clipboard.writeText(`https://${bookingUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full w-64 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Logo */}
      <div className="flex h-16 items-center px-4 border-b border-gray-200 dark:border-gray-800">
        <Logo size="md" className="hidden lg:block" />
        <LogoIcon size="md" className="lg:hidden" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-50"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Booking Link */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Your booking link
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white dark:bg-gray-900 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 truncate">
              {bookingUrl}
            </code>
            <button
              onClick={copyBookingLink}
              className="p-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 transition-colors"
              title="Copy link"
            >
              <RiLinksLine className="h-4 w-4" />
            </button>
          </div>
          {copied && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">Copied!</p>
          )}
        </div>
      </div>
    </div>
  );
}
