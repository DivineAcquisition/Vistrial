"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiBuilding2Line,
  RiSparklingLine,
  RiTimeLine,
  RiMapPinLine,
  RiBankCardLine,
  RiPaletteLine,
  RiNotification3Line,
  RiTeamLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";

const SETTINGS_NAV = [
  { href: "/settings/profile", label: "Business Profile", icon: RiBuilding2Line },
  { href: "/settings/services", label: "Services", icon: RiSparklingLine },
  { href: "/settings/availability", label: "Availability", icon: RiTimeLine },
  { href: "/settings/service-areas", label: "Service Areas", icon: RiMapPinLine },
  { href: "/settings/payments", label: "Payments", icon: RiBankCardLine },
  { href: "/settings/booking", label: "Booking Page", icon: RiPaletteLine },
  { href: "/settings/notifications", label: "Notifications", icon: RiNotification3Line },
  { href: "/settings/team", label: "Team", icon: RiTeamLine },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0">
        <nav className="space-y-1 sticky top-24">
          {SETTINGS_NAV.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-violet-100 text-violet-700"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
