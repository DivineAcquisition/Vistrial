'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  RiUserLine,
  RiSettings4Line,
  RiLogoutBoxLine,
  RiArrowDownSLine,
} from '@remixicon/react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface UserMenuProps {
  user: User;
  organization?: {
    name?: string;
    logo_url?: string;
  } | null;
}

export function UserMenu({ user, organization }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const displayName =
    user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const userEmail = user.email || '';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
      >
        {organization?.logo_url ? (
          <img
            src={organization.logo_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 bg-violet-900/30 rounded-full flex items-center justify-center">
            <RiUserLine className="w-4 h-4 text-brand-400" />
          </div>
        )}
        <div className="text-left hidden sm:block">
          <p className="text-sm font-medium text-gray-50">{displayName}</p>
          <p className="text-xs text-gray-400">{organization?.name}</p>
        </div>
        <RiArrowDownSLine className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-gray-900 rounded-lg shadow-lg border border-gray-800 py-1 z-50">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-sm font-medium text-gray-50">{displayName}</p>
            <p className="text-xs text-gray-400 truncate">{userEmail}</p>
          </div>

          <div className="py-1">
            <Link
              href="/settings"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              onClick={() => setOpen(false)}
            >
              <RiSettings4Line className="w-4 h-4" />
              Settings
            </Link>
          </div>

          <div className="border-t border-gray-800 py-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20"
            >
              <RiLogoutBoxLine className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
