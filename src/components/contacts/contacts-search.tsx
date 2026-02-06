// @ts-nocheck
'use client';

// ============================================
// CONTACTS SEARCH INPUT
// ============================================

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

interface ContactsSearchProps {
  initialValue?: string;
}

export function ContactsSearch({ initialValue }: ContactsSearchProps) {
  const [value, setValue] = useState(initialValue || '');
  const debouncedValue = useDebounce(value, 300);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedValue) {
      params.set('search', debouncedValue);
    } else {
      params.delete('search');
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }, [debouncedValue, pathname, router, searchParams]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        placeholder="Search contacts..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-9 bg-white border-gray-200 text-gray-900 placeholder:text-gray-500"
      />
    </div>
  );
}
