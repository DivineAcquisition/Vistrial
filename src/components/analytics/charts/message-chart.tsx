// @ts-nocheck
'use client';

// ============================================
// MESSAGE CHART
// Bar chart for message volume
// ============================================

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface MessageChartProps {
  data: Array<{
    date: string;
    sms: number;
    voice: number;
    delivered: number;
  }>;
}

export function MessageChart({ data }: MessageChartProps) {
  const formattedData = useMemo(() => {
    // Sample data if too many points (> 30 days)
    const sampledData = data.length > 30 
      ? data.filter((_, i) => i % Math.ceil(data.length / 30) === 0)
      : data;

    return sampledData.map((item) => ({
      ...item,
      displayDate: format(parseISO(item.date), 'MMM d'),
    }));
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No messages in this period
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            axisLine={{ stroke: '#374151' }}
            tickLine={{ stroke: '#374151' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            axisLine={{ stroke: '#374151' }}
            tickLine={{ stroke: '#374151' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#fff',
            }}
            labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}
            itemStyle={{ color: '#9ca3af' }}
          />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
          />
          <Bar
            dataKey="sms"
            name="SMS"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Bar
            dataKey="voice"
            name="Voice Drops"
            fill="#8b5cf6"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
