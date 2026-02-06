'use client';

import { useState } from 'react';
import Link from 'next/link';
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
} from '@remixicon/react';
import { cn } from '@/lib/utils/cn';
import { Logo } from '@/components/ui/Logo';
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
        'group flex items-center justify-between gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-gray-50 text-brand-600 dark:bg-white/5 dark:text-brand-400'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white'
      )}
    >
      <div className="flex items-center gap-x-3">
        <Icon
          className={cn(
            'h-5 w-5 shrink-0 transition-colors',
            isActive 
              ? 'text-brand-600 dark:text-brand-400' 
              : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
          )}
        />
        <span>{item.name}</span>
      </div>
      {item.badge && (
        <span className={cn(
          'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
          isActive 
            ? 'bg-brand-600 text-white' 
            : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
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
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 px-6 dark:border-gray-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo size="sm" />
        </Link>
      </div>

      {/* Search */}
      <div className="px-4 py-4">
        <button className="flex w-full items-center gap-x-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800">
          <RiSearchLine className="h-4 w-4 text-gray-400" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="hidden rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:inline-block dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Quick Actions */}
      <div className="px-4 pb-4">
        <Link
          href="/workflows/new"
          className="flex w-full items-center justify-center gap-x-2 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <RiAddLine className="h-4 w-4" />
          New Workflow
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4">
        <div className="space-y-1">
          {mainNavigation.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} />
          ))}
        </div>

        {/* Divider */}
        <div className="my-6 h-px bg-gray-200 dark:bg-gray-800" />

        {/* Settings Navigation */}
        <div className="space-y-1">
          {settingsNavigation.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* Organization Info */}
      <div className="border-t border-gray-200 p-4 dark:border-gray-800">
        <Link
          href="/settings/organization"
          className="group flex items-center gap-x-3 rounded-lg p-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/20 dark:bg-brand-400/10 dark:text-brand-400 dark:ring-brand-400/20">
            <RiBuilding2Line className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {organization.name}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              /{organization.slug}
            </p>
          </div>
          <RiArrowRightSLine className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* User section */}
      <div className="border-t border-gray-200 p-4 dark:border-gray-800">
        <div className="group flex items-center gap-x-3 rounded-lg p-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white shadow-sm ring-2 ring-white dark:ring-gray-950">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {displayName}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-gray-800"
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
        className="fixed left-4 top-4 z-40 rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm lg:hidden dark:border-gray-800 dark:bg-gray-950"
      >
        <RiMenuLine className="h-5 w-5 text-gray-700 dark:text-gray-300" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <RiCloseLine className="h-5 w-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col border-r border-gray-200 dark:border-gray-800">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}
