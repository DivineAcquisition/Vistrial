// @ts-nocheck
// ============================================
// MESSAGE ANALYTICS
// Messages over time chart
// ============================================

import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MessageChart } from './charts/message-chart';

interface MessageAnalyticsProps {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}

export async function MessageAnalytics({
  organizationId,
  startDate,
  endDate,
}: MessageAnalyticsProps) {
  const supabase = await getSupabaseServerClient();

  // Get daily message counts
  const { data: messages } = await supabase
    .from('messages')
    .select('type, created_at, status')
    .eq('organization_id', organizationId)
    .in('type', ['sms', 'voice_drop'])
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: true });

  // Aggregate by day
  const dailyData: Record<string, { date: string; sms: number; voice: number; delivered: number }> = {};

  // Fill in all dates in range
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0];
    dailyData[dateKey] = { date: dateKey, sms: 0, voice: 0, delivered: 0 };
    currentDate.setDate(currentDate.getDate() + 1);
  }

  messages?.forEach((msg) => {
    const date = new Date(msg.created_at).toISOString().split('T')[0];
    if (dailyData[date]) {
      if (msg.type === 'sms') {
        dailyData[date].sms++;
      } else if (msg.type === 'voice_drop') {
        dailyData[date].voice++;
      }
      if (msg.status === 'delivered') {
        dailyData[date].delivered++;
      }
    }
  });

  const chartData = Object.values(dailyData).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Calculate totals
  const totalSms = chartData.reduce((sum, d) => sum + d.sms, 0);
  const totalVoice = chartData.reduce((sum, d) => sum + d.voice, 0);

  return (
    <Card className="bg-white/80 border-gray-200">
      <CardHeader>
        <CardTitle className="text-gray-900">Messages Sent</CardTitle>
        <CardDescription className="text-gray-400">
          {totalSms.toLocaleString()} SMS and {totalVoice.toLocaleString()} voice drops
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MessageChart data={chartData} />
      </CardContent>
    </Card>
  );
}
