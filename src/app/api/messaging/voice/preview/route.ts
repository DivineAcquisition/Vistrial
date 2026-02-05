// @ts-nocheck
// ============================================
// VOICE PREVIEW API
// Generate voice preview without sending
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { generateVoicePreview } from '@/services/voicedrop.service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, voice_id } = body as {
      text: string;
      voice_id?: string;
    };

    if (!text) {
      return NextResponse.json(
        { error: 'Missing required field: text' },
        { status: 400 }
      );
    }

    // Limit preview text
    if (text.length > 500) {
      return NextResponse.json(
        { error: 'Preview text too long (max 500 characters)' },
        { status: 400 }
      );
    }

    const result = await generateVoicePreview({
      text,
      voiceId: voice_id,
      organizationId: context.organization.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to generate preview' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      audio_url: result.audioUrl,
      duration_seconds: result.durationSeconds,
    });
  } catch (error) {
    console.error('Voice preview error:', error);
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 });
  }
}
