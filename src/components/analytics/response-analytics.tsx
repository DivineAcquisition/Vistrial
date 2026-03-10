// @ts-nocheck
// ============================================
// RESPONSE ANALYTICS
// Response breakdown and intent analysis
// ============================================

import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ResponseChart } from './charts/response-chart';
import { Badge } from '@/components/ui/badge';

interface ResponseAnalyticsProps {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}

export async function ResponseAnalytics({
  organizationId,
  startDate,
  endDate,
}: ResponseAnalyticsProps) {
  const supabase = await getSupabaseServerClient();

  // Get inbound responses
  const { data: responses } = await supabase
    .from('messages')
    .select('status, created_at')
    .eq('organization_id', organizationId)
    .eq('direction', 'inbound')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const statusCounts: Record<string, number> = {
    positive: 0,
    negative: 0,
    opt_out: 0,
    neutral: 0,
  };

  const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'quit', 'remove'];
  const positiveKeywords = ['yes', 'interested', 'sure', 'book', 'schedule', 'thanks', 'great', 'love', 'awesome', 'absolutely'];
  const negativeKeywords = ['no', 'not interested', 'don\'t', 'never', 'wrong', 'spam'];

  responses?.forEach((response: any) => {
    const text = (response.content || '').toLowerCase().trim();
    if (optOutKeywords.some(k => text.includes(k))) {
      statusCounts.opt_out++;
    } else if (positiveKeywords.some(k => text.includes(k))) {
      statusCounts.positive++;
    } else if (negativeKeywords.some(k => text.includes(k))) {
      statusCounts.negative++;
    } else {
      statusCounts.neutral++;
    }
  });

  const chartData = [
    { name: 'Positive', value: statusCounts.positive, color: '#22c55e' },
    { name: 'Neutral', value: statusCounts.neutral, color: '#3b82f6' },
    { name: 'Negative', value: statusCounts.negative, color: '#f97316' },
    { name: 'Opt-out', value: statusCounts.opt_out, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  const totalResponses = responses?.length || 0;

  return (
    <Card className="bg-white/80 border-gray-200">
      <CardHeader>
        <CardTitle className="text-gray-900">Response Analysis</CardTitle>
        <CardDescription className="text-gray-400">
          Breakdown of {totalResponses.toLocaleString()} responses by sentiment
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totalResponses > 0 ? (
          <div className="space-y-4">
            <ResponseChart data={chartData} />
            <div className="grid grid-cols-2 gap-2">
              {chartData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-gray-900">{item.name}</span>
                  </div>
                  <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                    {item.value} ({((item.value / totalResponses) * 100).toFixed(0)}%)
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No responses in this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
