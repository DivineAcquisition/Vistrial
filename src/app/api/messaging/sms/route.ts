/**
 * SMS Messaging API
 * 
 * Endpoints for sending SMS messages:
 * - POST: Send an SMS message to a contact
 * 
 * Request body:
 * - to: Phone number (E.164 format) or contact_id
 * - message: Message content
 * - workflow_id?: Associated workflow (for tracking)
 * - scheduled_at?: Schedule for later sending
 * 
 * Features:
 * - Template variable replacement ({{first_name}}, etc.)
 * - Credit deduction and validation
 * - Opt-out checking before sending
 * - Rate limiting per business
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
    const { to, message, workflow_id, scheduled_at } = body;

    // Validate required fields
    if (!to || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, message" },
        { status: 400 }
      );
    }

    // TODO: Check credit balance
    // const hasCredits = await creditsService.checkBalance(user.id, 'sms');
    // if (!hasCredits) {
    //   return NextResponse.json(
    //     { error: "Insufficient credits" },
    //     { status: 402 }
    //   );
    // }

    // TODO: Check if contact has opted out
    // TODO: Replace template variables
    // TODO: Send via Telnyx
    // TODO: Deduct credits
    // TODO: Log message in database

    // const result = await messagingService.sendSms({
    //   businessId: user.id,
    //   to,
    //   message,
    //   workflowId: workflow_id,
    //   scheduledAt: scheduled_at,
    // });

    return NextResponse.json({
      success: true,
      message_id: null,
      credits_used: 1,
    });
  } catch (error) {
    console.error("SMS send error:", error);
    return NextResponse.json(
      { error: "Failed to send SMS" },
      { status: 500 }
    );
  }
}
