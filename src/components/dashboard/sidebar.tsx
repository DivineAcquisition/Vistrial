'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  RiDashboardLine,
  RiDashboardFill,
  RiCalendarLine,
  RiCalendarFill,
  RiContactsLine,
  RiContactsFill,
  RiFlowChart,
  RiSettings4Line,
  RiSettings4Fill,
  RiQuestionLine,
  RiQuestionFill,
  RiMenuLine,
  RiCloseLine,
  RiLineChartLine,
  RiLineChartFill,
  RiWalletLine,
  RiWalletFill,
  RiSearchLine,
  RiLogoutBoxRLine,
  RiAddLine,
  RiInboxLine,
  RiInboxFill,
  RiBuilding2Line,
  RiArrowRightSLine,
  RiSparklingLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';

interface SidebarProps {
  organization: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
  };
  user?: {
    email?: string;
    user_metadata?: {
      full_name?: string;
    };
  };
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconActive: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const mainNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: RiDashboardLine, iconActive: RiDashboardFill },
  { name: 'Inbox', href: '/inbox', icon: RiInboxLine, iconActive: RiInboxFill },
  { name: 'Contacts', href: '/contacts', icon: RiContactsLine, iconActive: RiContactsFill },
  { name: 'Workflows', href: '/workflows', icon: RiFlowChart, iconActive: RiFlowChart },
  { name: 'Bookings', href: '/bookings', icon: RiCalendarLine, iconActive: RiCalendarFill },
  { name: 'Analytics', href: '/analytics', icon: RiLineChartLine, iconActive: RiLineChartFill },
];

const settingsNavigation: NavItem[] = [
  { name: 'Billing', href: '/settings/billing', icon: RiWalletLine, iconActive: RiWalletFill },
  { name: 'Settings', href: '/settings', icon: RiSettings4Line, iconActive: RiSettings4Fill },
  { name: 'Help', href: '/help', icon: RiQuestionLine, iconActive: RiQuestionFill },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')) ||
    (item.href === '/settings' && pathname.startsWith('/settings') && !pathname.includes('/billing'));

  const Icon = isActive ? item.iconActive : item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-center justify-between gap-x-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-brand-50/80 text-brand-700'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-brand-500 to-brand-400" />
      )}

      <div className="flex items-center gap-x-3">
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
            isActive
              ? 'text-brand-600'
              : 'text-gray-400 group-hover:text-gray-600'
          )}
        />
        <span className="tracking-[-0.01em]">{item.name}</span>
      </div>
      {item.badge && (
        <span className={cn(
          'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
          isActive
            ? 'bg-brand-600 text-white'
            : 'bg-gray-200/80 text-gray-600'
        )}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export function DashboardSidebar({ organization, user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-white">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-100 px-6">
        <Link href="/dashboard" className="flex items-center">
          <Image
            src="/VistrialLT.png"
            alt="Vistrial"
            width={120}
            height={60}
            className="h-7 w-auto object-contain"
            priority
          />
        </Link>
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-3">
        <button className="flex w-full items-center gap-x-3 rounded-xl border border-gray-200/80 bg-gray-50/80 px-3.5 py-2.5 text-sm text-gray-400 transition-all duration-200 hover:border-gray-300 hover:bg-gray-100/80 hover:text-gray-500">
          <RiSearchLine className="h-4 w-4" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="hidden rounded-md border border-gray-200/80 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 shadow-xs sm:inline-block">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Quick Actions */}
      <div className="px-4 pb-4">
        <Link
          href="/workflows/new"
          className="group flex w-full items-center justify-center gap-x-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(83,71,209,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-200 hover:from-brand-600 hover:to-brand-700 hover:shadow-[0_4px_16px_rgba(83,71,209,0.35)] active:scale-[0.97]"
        >
          <RiSparklingLine className="h-4 w-4 transition-transform group-hover:rotate-12" />
          New Workflow
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="space-y-0.5">
          {mainNavigation.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} />
          ))}
        </div>

        {/* Divider */}
        <div className="my-5 mx-3 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

        {/* Settings Navigation */}
        <div className="space-y-0.5">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Settings
          </p>
          {settingsNavigation.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* Organization Info */}
      <div className="border-t border-gray-100 p-3">
        <Link
          href="/settings/organization"
          className="group flex items-center gap-x-3 rounded-xl p-2.5 transition-all duration-200 hover:bg-gray-50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/80 text-brand-600 ring-1 ring-inset ring-brand-200/30">
            <RiBuilding2Line className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 tracking-[-0.01em]">
              {organization.name}
            </p>
            <p className="truncate text-[11px] text-gray-400">
              /{organization.slug}
            </p>
          </div>
          <RiArrowRightSLine className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-400" />
        </Link>
      </div>

      {/* User section */}
      <div className="border-t border-gray-100 p-3">
        <div className="group flex items-center gap-x-3 rounded-xl p-2.5 transition-all duration-200 hover:bg-gray-50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-[11px] font-bold text-white shadow-sm shadow-brand-600/25 ring-2 ring-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900 tracking-[-0.01em]">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-gray-400">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-all duration-200 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          >
            <RiLogoutBoxRLine className="h-4 w-4" />
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
        className="fixed left-4 top-4 z-40 rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm p-2.5 shadow-soft transition-all duration-200 hover:bg-gray-50 lg:hidden"
      >
        <RiMenuLine className="h-5 w-5 text-gray-700" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 shadow-soft-xl animate-slide-in-from-left">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <RiCloseLine className="h-5 w-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[270px] lg:flex-col">
        <div className="flex grow flex-col border-r border-gray-200/80">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}
