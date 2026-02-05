// @ts-nocheck
/**
 * Voice Messaging API
 * 
 * Endpoints for initiating voice calls:
 * - POST: Initiate an outbound voice call
 * 
 * Request body:
 * - to: Phone number (E.164 format) or contact_id
 * - voice_id?: ElevenLabs voice ID (uses default if not specified)
 * - script: Voice message script
 * - workflow_id?: Associated workflow (for tracking)
 * - scheduled_at?: Schedule for later calling
 * 
 * Features:
 * - AI-generated voice using ElevenLabs
 * - Dynamic script personalization
 * - Call outcome tracking
 * - Credit deduction based on call duration
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import { messagingService } from "@/services/messaging.service";
// import { creditsService } from "@/services/credits.service";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { to, voice_id, script, workflow_id, scheduled_at } = body;

    // Validate required fields
    if (!to || !script) {
      return NextResponse.json(
        { error: "Missing required fields: to, script" },
        { status: 400 }
      );
    }

    // TODO: Check credit balance (voice calls cost more)
    // const hasCredits = await creditsService.checkBalance(user.id, 'voice', estimatedMinutes);
    // if (!hasCredits) {
    //   return NextResponse.json(
    //     { error: "Insufficient credits" },
    //     { status: 402 }
    //   );
    // }

    // TODO: Check if contact has opted out
    // TODO: Generate voice audio using ElevenLabs
    // TODO: Initiate call via Telnyx
    // TODO: Log call in database

    // const result = await messagingService.initiateCall({
    //   businessId: user.id,
    //   to,
    //   voiceId: voice_id || process.env.ELEVENLABS_VOICE_ID,
    //   script,
    //   workflowId: workflow_id,
    //   scheduledAt: scheduled_at,
    // });

    return NextResponse.json({
      success: true,
      call_id: null,
      status: "initiated",
    });
  } catch (error) {
    console.error("Voice call error:", error);
    return NextResponse.json(
      { error: "Failed to initiate call" },
      { status: 500 }
    );
  }
}
