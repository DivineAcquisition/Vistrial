// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { analyzeSentiment } from '@/lib/agent/drafting';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { text } = await request.json();
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

    const result = await analyzeSentiment(text);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
