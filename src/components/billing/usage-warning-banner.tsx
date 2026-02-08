'use client';

// ============================================
// USAGE WARNING BANNER
// Shown in dashboard when approaching limits
// ============================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { X, AlertTriangle, ArrowRight } from 'lucide-react';

interface UsageWarning {
  resourceType: string;
  message: string;
  percent: number;
}

export function UsageWarningBanner() {
  const [warnings, setWarnings] = useState<UsageWarning[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWarnings = async () => {
      try {
        const response = await fetch('/api/billing/usage/warnings');
        if (response.ok) {
          const data = await response.json();
          setWarnings(data.warnings || []);
        }
      } catch (error) {
        console.error('Failed to fetch usage warnings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchWarnings();
  }, []);

  const visibleWarnings = warnings.filter((w) => !dismissed.includes(w.resourceType));

  if (isLoading || visibleWarnings.length === 0) return null;

  const topWarning = visibleWarnings[0];
  const isCritical = topWarning.percent >= 95;

  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border ${
      isCritical
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'
    }`}>
      <AlertTriangle className={`h-5 w-5 shrink-0 ${isCritical ? 'text-red-600' : 'text-amber-600'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
          {isCritical ? 'Usage Critical' : 'Usage Warning'}
        </p>
        <p className={`text-xs mt-0.5 ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
          {topWarning.message}
        </p>
        <Progress value={topWarning.percent} className="h-1.5 mt-2" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/settings/billing">
          <Button size="sm" variant={isCritical ? 'destructive' : 'default'} className="rounded-xl">
            Upgrade <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
        <button
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          onClick={() => setDismissed([...dismissed, topWarning.resourceType])}
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
