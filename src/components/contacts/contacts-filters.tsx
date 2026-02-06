// @ts-nocheck
'use client';

// ============================================
// CONTACTS FILTERS SIDEBAR
// ============================================

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-green-500/20 text-green-400' },
  { value: 'unsubscribed', label: 'Unsubscribed', color: 'bg-red-500/20 text-red-400' },
  { value: 'bounced', label: 'Bounced', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'invalid', label: 'Invalid', color: 'bg-gray-500/20 text-gray-400' },
];

export function ContactsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status')?.split(',') || [];

  const updateFilters = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // Reset to page 1 when filtering
    router.push(`${pathname}?${params.toString()}`);
  };

  const toggleStatus = (status: string) => {
    const newStatuses = currentStatus.includes(status)
      ? currentStatus.filter((s) => s !== status)
      : [...currentStatus, status];

    updateFilters('status', newStatuses.length > 0 ? newStatuses.join(',') : null);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const hasActiveFilters = searchParams.toString().length > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Filters</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-400 hover:text-gray-900">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Status Filter */}
      <div className="space-y-3">
        <Label className="text-gray-400">Status</Label>
        <div className="space-y-2">
          {STATUS_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`status-${option.value}`}
                checked={currentStatus.includes(option.value)}
                onCheckedChange={() => toggleStatus(option.value)}
                className="border-gray-300"
              />
              <label
                htmlFor={`status-${option.value}`}
                className="text-sm cursor-pointer flex items-center gap-2"
              >
                <Badge variant="secondary" className={option.color}>
                  {option.label}
                </Badge>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Filters */}
      <div className="space-y-3">
        <Label className="text-gray-400">Quick Filters</Label>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start border-gray-200 bg-gray-800/50 hover:bg-gray-50 text-gray-300"
            onClick={() => updateFilters('has_phone', 'true')}
          >
            Has Phone Number
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start border-gray-200 bg-gray-800/50 hover:bg-gray-50 text-gray-300"
            onClick={() => updateFilters('has_email', 'true')}
          >
            Has Email
          </Button>
        </div>
      </div>
    </div>
  );
}
