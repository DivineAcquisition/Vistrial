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
  RiSparklingLine,
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

  // Use local path for development, subdomain in production
  const isProduction = typeof window !== "undefined" && window.location.hostname.includes("vistrial.io");
  const bookingUrl = isProduction 
    ? `book.vistrial.io/${business.slug}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/book/${business.slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(bookingUrl.startsWith("http") ? bookingUrl : `https://${bookingUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-500 rounded-xl blur-md opacity-50" />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/25">
              <Image
                src="/Untitled design (2).png"
                alt="Vistrial"
                width={28}
                height={28}
                className="rounded-lg"
                unoptimized
              />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Vistrial</h1>
            <p className="text-xs text-gray-400">Quote Follow-Up</p>
          </div>
        </Link>
      </div>

      {/* Business info */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt=""
              className="w-10 h-10 rounded-lg object-cover ring-2 ring-white/10"
            />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-brand-400/20 to-brand-600/20 rounded-lg flex items-center justify-center ring-2 ring-white/10">
              <span className="text-brand-400 font-semibold text-lg">
                {business.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">{business.name}</p>
            <p className="text-xs text-gray-500 truncate">/book/{business.slug}</p>
          </div>
        </div>

        {/* Booking link actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-gray-300 hover:text-white"
          >
            {copied ? (
              <>
                <RiCheckLine className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <RiFileCopyLine className="w-4 h-4" />
                <span>Copy Link</span>
              </>
            )}
          </button>
          <Link
            href={`/book/${business.slug}`}
            target="_blank"
            className="flex items-center justify-center px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-gray-300 hover:text-white"
          >
            <RiExternalLinkLine className="w-4 h-4" />
          </Link>
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
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                isActive
                  ? "bg-gradient-to-r from-brand-500/20 to-brand-600/20 text-white border border-brand-500/30"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-xl bg-brand-500/10 blur-lg -z-10" />
              )}
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300",
                isActive
                  ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
                  : "bg-white/5 group-hover:bg-white/10"
              )}>
                <item.icon className={cn(
                  "w-4 h-4",
                  isActive ? "text-white" : "text-gray-400 group-hover:text-white"
                )} />
              </div>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav */}
      <div className="p-4 border-t border-white/10 space-y-1">
        {secondaryNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <RiSparklingLine className="w-3 h-3" />
          <span>Powered by Vistrial</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:bg-gray-900/80 lg:backdrop-blur-xl lg:border-r lg:border-white/10">
        <SidebarContent />
      </aside>

      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-lg"
      >
        <RiMenuLine className="w-6 h-6 text-white" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setMobileOpen(false)}
          />

          {/* Sidebar */}
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-gray-900/95 backdrop-blur-xl border-r border-white/10">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <RiCloseLine className="w-6 h-6 text-gray-400" />
            </button>
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  );
}
