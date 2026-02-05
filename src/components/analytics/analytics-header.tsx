// @ts-nocheck
'use client';

// ============================================
// ANALYTICS HEADER
// ============================================

import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, Download } from 'lucide-react';

interface AnalyticsHeaderProps {
  currentRange: string;
}

const DATE_RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
];

export function AnalyticsHeader({ currentRange }: AnalyticsHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleRangeChange = (value: string) => {
    router.push(`${pathname}?range=${value}`);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Analytics
        </h1>
        <p className="text-gray-400">
          Track your campaign performance and engagement
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={currentRange} onValueChange={handleRangeChange}>
          <SelectTrigger className="w-40 bg-gray-800 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-white/10">
            {DATE_RANGES.map((range) => (
              <SelectItem 
                key={range.value} 
                value={range.value}
                className="text-white hover:bg-gray-700 focus:bg-gray-700"
              >
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" className="border-white/10 text-white hover:bg-gray-800">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
    </div>
  );
}
