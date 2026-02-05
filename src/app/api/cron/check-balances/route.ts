// @ts-nocheck
// ============================================
// CRON: CHECK CREDIT BALANCES & AUTO-REFILL
// Run every 15 minutes via Vercel Cron or similar
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { processAutoRefills } from '@/services/billing.service';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await processAutoRefills();

    console.log('Auto-refill results:', result);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Auto-refill cron error:', error);
    return NextResponse.json(
      { error: 'Auto-refill processing failed' },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
