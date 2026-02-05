'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  RiDashboardLine,
  RiCalendarLine,
  RiContactsLine,
  RiFlowChart,
  RiSettings4Line,
  RiQuestionLine,
  RiMenuLine,
  RiCloseLine,
  RiLineChartLine,
  RiWalletLine,
  RiSearchLine,
  RiLogoutBoxRLine,
  RiAddLine,
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
  badge?: string;
}

const mainNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: RiDashboardLine },
  { name: 'Contacts', href: '/contacts', icon: RiContactsLine },
  { name: 'Workflows', href: '/workflows', icon: RiFlowChart },
  { name: 'Bookings', href: '/bookings', icon: RiCalendarLine },
  { name: 'Analytics', href: '/analytics', icon: RiLineChartLine },
];

const settingsNavigation: NavItem[] = [
  { name: 'Billing', href: '/settings/billing', icon: RiWalletLine },
  { name: 'Settings', href: '/settings', icon: RiSettings4Line },
  { name: 'Help', href: '/help', icon: RiQuestionLine },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')) ||
    (item.href === '/settings' && pathname.startsWith('/settings') && !pathname.includes('/billing'));

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-violet-500/10 text-violet-400'
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      )}
    >
      <div className="flex items-center gap-3">
        <item.icon
          className={cn(
            'w-5 h-5 transition-colors',
            isActive ? 'text-violet-400' : 'text-gray-500 group-hover:text-gray-300'
          )}
        />
        <span>{item.name}</span>
        {item.badge && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-violet-500/20 text-violet-400">
            {item.badge}
          </span>
        )}
      </div>
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
    <div className="flex flex-col h-full bg-gray-900">
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <Logo size="sm" />
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <button className="w-full flex items-center gap-2 h-9 px-3 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-500 hover:text-gray-300 transition-colors">
          <RiSearchLine className="w-4 h-4" />
          <span>Search...</span>
          <kbd className="ml-auto text-[10px] text-gray-500 font-medium px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Quick Actions */}
      <div className="px-3 pb-3">
        <Link
          href="/workflows/new"
          className="w-full flex items-center justify-center gap-2 h-9 px-3 text-sm bg-violet-600 hover:bg-violet-700 rounded-lg text-white font-medium transition-colors"
        >
          <RiAddLine className="w-4 h-4" />
          New Workflow
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {mainNavigation.map((item) => (
          <NavLink key={item.name} item={item} pathname={pathname} />
        ))}

        {/* Divider */}
        <div className="h-px bg-white/10 my-4" />

        {settingsNavigation.map((item) => (
          <NavLink key={item.name} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Organization Info */}
      <div className="px-3 py-2 border-t border-white/10">
        <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-purple-500/10 border border-violet-500/20">
          <p className="text-xs font-semibold text-violet-400 mb-1">
            Organization
          </p>
          <p className="text-sm text-white truncate">{organization.name}</p>
          <p className="text-xs text-gray-500 truncate">/{organization.slug}</p>
        </div>
      </div>

      {/* User section */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-semibold shadow-sm shadow-violet-500/30">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-red-400"
          >
            <RiLogoutBoxRLine className="w-4 h-4" />
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
        className="fixed top-4 left-4 z-40 lg:hidden p-2.5 bg-gray-900 rounded-xl shadow-lg border border-white/10"
      >
        <RiMenuLine className="w-5 h-5 text-gray-300" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white z-10"
            >
              <RiCloseLine className="w-5 h-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <SidebarContent />
      </div>
    </>
  );
}
