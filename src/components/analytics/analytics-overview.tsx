// @ts-nocheck
// ============================================
// ANALYTICS OVERVIEW
// Key metrics cards
// ============================================

import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  MessageSquare,
  Phone,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface AnalyticsOverviewProps {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}

export async function AnalyticsOverview({
  organizationId,
  startDate,
  endDate,
}: AnalyticsOverviewProps) {
  const supabase = await getSupabaseServerClient();

  // Calculate previous period for comparison
  const periodLength = endDate.getTime() - startDate.getTime();
  const prevStartDate = new Date(startDate.getTime() - periodLength);
  const prevEndDate = new Date(startDate.getTime());

  // Current period stats
  const { count: currentSms } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('type', 'sms')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const { count: currentVoice } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('type', 'voice_drop')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const { count: currentResponses } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('direction', 'inbound')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const { count: currentEnrollments } = await supabase
    .from('workflow_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('enrolled_at', startDate.toISOString())
    .lte('enrolled_at', endDate.toISOString());

  // Previous period stats
  const { count: prevSms } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('type', 'sms')
    .gte('created_at', prevStartDate.toISOString())
    .lte('created_at', prevEndDate.toISOString());

  const { count: prevVoice } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('type', 'voice_drop')
    .gte('created_at', prevStartDate.toISOString())
    .lte('created_at', prevEndDate.toISOString());

  const { count: prevResponses } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('direction', 'inbound')
    .gte('created_at', prevStartDate.toISOString())
    .lte('created_at', prevEndDate.toISOString());

  const { count: prevEnrollments } = await supabase
    .from('workflow_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('enrolled_at', prevStartDate.toISOString())
    .lte('enrolled_at', prevEndDate.toISOString());

  // Calculate response rate
  const totalMessages = (currentSms || 0) + (currentVoice || 0);
  const responseRate = totalMessages > 0
    ? ((currentResponses || 0) / totalMessages) * 100
    : 0;

  const prevTotalMessages = (prevSms || 0) + (prevVoice || 0);
  const prevResponseRate = prevTotalMessages > 0
    ? ((prevResponses || 0) / prevTotalMessages) * 100
    : 0;

  const metrics = [
    {
      title: 'SMS Sent',
      value: currentSms || 0,
      prevValue: prevSms || 0,
      icon: MessageSquare,
      color: 'text-blue-400 bg-blue-500/20',
    },
    {
      title: 'Voice Drops',
      value: currentVoice || 0,
      prevValue: prevVoice || 0,
      icon: Phone,
      color: 'text-purple-400 bg-purple-500/20',
    },
    {
      title: 'Responses',
      value: currentResponses || 0,
      prevValue: prevResponses || 0,
      icon: Users,
      color: 'text-green-400 bg-green-500/20',
    },
    {
      title: 'Response Rate',
      value: responseRate,
      prevValue: prevResponseRate,
      icon: TrendingUp,
      color: 'text-orange-400 bg-orange-500/20',
      isPercentage: true,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => {
        const change = metric.prevValue
          ? ((metric.value - metric.prevValue) / metric.prevValue) * 100
          : 0;
        const isPositive = change >= 0;

        return (
          <Card key={metric.title} className="bg-gray-900/80 border-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-400">
                  {metric.title}
                </p>
                <div className={cn('p-2 rounded-lg', metric.color)}>
                  <metric.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-3xl font-bold text-white">
                  {metric.isPercentage
                    ? `${metric.value.toFixed(1)}%`
                    : metric.value.toLocaleString()}
                </p>
                {metric.prevValue > 0 && (
                  <div className="mt-1 flex items-center text-sm">
                    <span
                      className={cn(
                        'flex items-center',
                        isPositive ? 'text-green-400' : 'text-red-400'
                      )}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                    <span className="text-gray-500 ml-1">
                      vs previous period
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
