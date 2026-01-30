"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  CreditCard,
  FileText,
  Settings,
  HelpCircle,
  Menu,
  X,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
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
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Bookings", href: "/bookings", icon: Calendar },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Memberships", href: "/memberships", icon: CreditCard },
  { name: "Quotes", href: "/quotes", icon: FileText },
];

const secondaryNav = [
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Help", href: "/help", icon: HelpCircle },
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
      <div className="p-4 border-b">
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
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt=""
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <span className="text-violet-600 font-semibold text-lg">
                {business.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900 truncate">{business.name}</p>
            <p className="text-xs text-slate-500 truncate">{bookingUrl}</p>
          </div>
        </div>

        {/* Booking link actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Link</span>
              </>
            )}
          </button>
          <a
            href={`https://${bookingUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
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
                  ? "bg-violet-100 text-violet-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav */}
      <div className="p-4 border-t space-y-1">
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
                  ? "bg-violet-100 text-violet-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:bg-white lg:border-r">
        <SidebarContent />
      </aside>

      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md"
      >
        <Menu className="w-6 h-6" />
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
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1"
            >
              <X className="w-6 h-6" />
            </button>
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  );
}
