// @ts-nocheck
// ============================================
// ANALYTICS PAGE
// Comprehensive analytics dashboard
// ============================================

import { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { AnalyticsHeader } from '@/components/analytics/analytics-header';
import { AnalyticsOverview } from '@/components/analytics/analytics-overview';
import { MessageAnalytics } from '@/components/analytics/message-analytics';
import { WorkflowAnalytics } from '@/components/analytics/workflow-analytics';
import { ResponseAnalytics } from '@/components/analytics/response-analytics';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Analytics',
};

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  // Parse date range from query params
  const range = (searchParams.range as string) || '30d';
  const { startDate, endDate } = getDateRange(range);

  return (
    <div className="space-y-6">
      <AnalyticsHeader currentRange={range} />

      <Suspense fallback={<OverviewSkeleton />}>
        <AnalyticsOverview
          organizationId={context.organization.id}
          startDate={startDate}
          endDate={endDate}
        />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<ChartSkeleton />}>
          <MessageAnalytics
            organizationId={context.organization.id}
            startDate={startDate}
            endDate={endDate}
          />
        </Suspense>

        <Suspense fallback={<ChartSkeleton />}>
          <ResponseAnalytics
            organizationId={context.organization.id}
            startDate={startDate}
            endDate={endDate}
          />
        </Suspense>
      </div>

      <Suspense fallback={<ChartSkeleton />}>
        <WorkflowAnalytics
          organizationId={context.organization.id}
          startDate={startDate}
          endDate={endDate}
        />
      </Suspense>
    </div>
  );
}

function getDateRange(range: string): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  switch (range) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    case 'ytd':
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  return { startDate, endDate };
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 bg-gray-50" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-80 bg-gray-50" />;
}
