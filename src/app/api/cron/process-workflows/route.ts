// @ts-nocheck
// ============================================
// CRON: PROCESS WORKFLOWS
// Run every 5 minutes via Vercel Cron or similar
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { processWorkflows } from '@/services/workflow-processor.service';

export const maxDuration = 300; // 5 minutes max execution time

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const startTime = Date.now();
    const result = await processWorkflows(100);
    const duration = Date.now() - startTime;

    console.log('Workflow processing complete:', {
      ...result,
      duration_ms: duration,
    });

    return NextResponse.json({
      success: true,
      ...result,
      duration_ms: duration,
    });
  } catch (error) {
    console.error('Workflow processing error:', error);
    return NextResponse.json({ error: 'Workflow processing failed' }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
