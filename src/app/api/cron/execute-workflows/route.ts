// ============================================
// WORKFLOW EXECUTION CRON ENDPOINT
// Runs every minute via Vercel Cron
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { executeScheduledSteps } from '@/lib/cron/workflow-executor';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      const cronHeader = request.headers.get('x-vercel-cron');
      if (!cronHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('Starting workflow execution cron...');
    const startTime = Date.now();

    const result = await executeScheduledSteps();

    const duration = Date.now() - startTime;
    console.log(`Cron completed in ${duration}ms:`, result);

    return NextResponse.json({ success: true, duration, ...result });
  } catch (error) {
    console.error('Cron execution error:', error);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
