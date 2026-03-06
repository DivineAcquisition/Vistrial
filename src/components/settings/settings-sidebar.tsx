'use client';

// ============================================
// SETTINGS SIDEBAR NAVIGATION
// ============================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
  User,
  Building2,
  Bell,
  CreditCard,
  Users,
  MessageSquare,
  Calendar,
  Key,
  Shield,
  HelpCircle,
} from 'lucide-react';

const SETTINGS_NAV = [
  {
    label: 'Account',
    items: [
      { href: '/settings/profile', label: 'Profile', icon: User },
      { href: '/settings/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/settings/business', label: 'Business Info', icon: Building2 },
      { href: '/settings/team', label: 'Team', icon: Users },
      { href: '/settings/billing', label: 'Billing', icon: CreditCard },
    ],
  },
  {
    label: 'Features',
    items: [
      { href: '/settings/messaging', label: 'Messaging', icon: MessageSquare },
      { href: '/settings/booking', label: 'Booking', icon: Calendar },
    ],
  },
  {
    label: 'Developer',
    items: [
      { href: '/settings/api', label: 'API Keys', icon: Key },
    ],
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200/80 bg-white hidden lg:block">
      <div className="sticky top-0 p-4 space-y-6">
        {SETTINGS_NAV.map((section) => (
          <div key={section.label}>
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5 px-3">
              {section.label}
            </h3>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/settings/billing' && pathname.startsWith(item.href + '/'));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'bg-brand-50/80 text-brand-700'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4', isActive ? 'text-brand-600' : 'text-gray-400')} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
            Need help?
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            support@vistrial.io
          </p>
        </div>
      </div>
    </aside>
  );
}
