// @ts-nocheck
// ============================================
// AVAILABLE VOICES API
// List available ElevenLabs voices
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { AVAILABLE_VOICES, getVoicesForCategory } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let voices = AVAILABLE_VOICES;

    if (category) {
      voices = getVoicesForCategory(category);
    }

    return NextResponse.json({
      voices: voices.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        gender: v.gender,
        accent: v.accent,
        use_cases: v.useCase,
      })),
    });
  } catch (error) {
    console.error('List voices error:', error);
    return NextResponse.json({ error: 'Failed to list voices' }, { status: 500 });
  }
}
