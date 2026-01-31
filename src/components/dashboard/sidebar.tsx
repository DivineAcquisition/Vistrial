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
  RiQuestionLine,
  RiMenuLine,
  RiCloseLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiCheckLine,
  RiSparklingLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { LogoIcon } from "@/components/ui/Logo";

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
      <div className="p-4 border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center gap-3">
          <LogoIcon size={40} />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Vistrial</h1>
            <p className="text-xs text-gray-500">Quote Follow-Up</p>
          </div>
        </Link>
      </div>

      {/* Business info */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            <div className="w-10 h-10 rounded-lg overflow-hidden ring-2 ring-gray-100">
              <img
                src={business.logo_url}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-brand-100 to-brand-200 rounded-lg flex items-center justify-center ring-2 ring-gray-100">
              <span className="text-brand-600 font-semibold text-lg">
                {business.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{business.name}</p>
            <p className="text-xs text-gray-500 truncate">/book/{business.slug}</p>
          </div>
        </div>

        {/* Booking link actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-all text-gray-600 hover:text-gray-900"
          >
            {copied ? (
              <>
                <RiCheckLine className="w-4 h-4 text-green-500" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <RiFileCopyLine className="w-4 h-4" />
                <span>Copy link</span>
              </>
            )}
          </button>
          <a
            href={bookingUrl.startsWith("http") ? bookingUrl : `https://${bookingUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-all text-gray-600 hover:text-gray-900"
          >
            <RiExternalLinkLine className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                    isActive
                      ? "bg-brand-50 text-brand-700 border border-brand-200"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    isActive
                      ? "bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25"
                      : "bg-gray-100"
                  )}>
                    <item.icon className={cn(
                      "w-4 h-4",
                      isActive ? "text-white" : "text-gray-500"
                    )} />
                  </div>
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <ul className="space-y-1">
            {secondaryNav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                      isActive
                        ? "bg-brand-50 text-brand-700 border border-brand-200"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      isActive
                        ? "bg-gradient-to-br from-brand-500 to-brand-600"
                        : "bg-gray-100"
                    )}>
                      <item.icon className={cn(
                        "w-4 h-4",
                        isActive ? "text-white" : "text-gray-500"
                      )} />
                    </div>
                    <span className="font-medium">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <RiSparklingLine className="w-3 h-3" />
          <span>Powered by Vistrial</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-40 lg:hidden p-2 bg-white rounded-xl shadow-lg border border-gray-200"
      >
        <RiMenuLine className="w-6 h-6 text-gray-600" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700"
            >
              <RiCloseLine className="w-6 h-6" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block w-72 bg-white border-r border-gray-200 h-screen">
        <SidebarContent />
      </div>
    </>
  );
}
