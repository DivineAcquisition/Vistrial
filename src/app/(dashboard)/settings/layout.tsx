"use client";

import { siteConfig } from "@/app/siteConfig";
import { cx } from "@/lib/utils";
import {
  RiUserLine,
  RiPhoneLine,
  RiFlashlightLine,
} from "@remixicon/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationSettings = [
  { name: "Business Profile", href: siteConfig.baseLinks.settings.general, icon: RiUserLine },
  { name: "Integrations", href: siteConfig.baseLinks.settings.billing, icon: RiPhoneLine },
  { name: "Service Types", href: siteConfig.baseLinks.settings.users, icon: RiFlashlightLine },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-gray-400">Manage your account and integrations</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Sidebar */}
        <div className="h-fit">
          <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
            <nav className="space-y-1">
              {navigationSettings.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cx(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                      active
                        ? "bg-brand-500/20 text-brand-400 border border-brand-500/30"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <div
                      className={cx(
                        "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                        active
                          ? "bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25"
                          : "bg-white/5 group-hover:bg-white/10"
                      )}
                    >
                      <item.icon
                        className={cx(
                          "h-4 w-4",
                          active ? "text-white" : "text-gray-500 group-hover:text-gray-300"
                        )}
                      />
                    </div>
                    <span className="font-medium">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 lg:col-span-3">{children}</div>
      </div>
    </div>
  );
}
