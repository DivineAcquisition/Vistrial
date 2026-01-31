import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateVerificationCode, sendVerificationEmail } from "@/lib/email/resend";

export async function POST(request: NextRequest) {
  try {
    const { email, businessName } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Generate a 6-digit code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store the code in the database (or in-memory for now)
    // We'll store it in a verification_codes table if it exists,
    // otherwise use Supabase's built-in auth metadata
    const supabase = await createServerSupabaseClient();

    // Try to store in verification_codes table
    try {
      await supabase.from("verification_codes").upsert(
        {
          email,
          code,
          expires_at: expiresAt.toISOString(),
          verified: false,
          created_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );
    } catch (dbError) {
      console.log("verification_codes table may not exist, using memory storage");
      // Store in global memory as fallback (for development)
      if (!global.verificationCodes) {
        global.verificationCodes = new Map();
      }
      global.verificationCodes.set(email, {
        code,
        expiresAt,
        verified: false,
      });
    }

    // Send the verification email
    const result = await sendVerificationEmail(email, code, businessName);

    if (!result.success) {
      // For development, log the code if email fails
      console.log(`[DEV] Verification code for ${email}: ${code}`);
      return NextResponse.json({
        success: true,
        message: "Verification code generated",
        // Include code in dev mode for testing
        ...(process.env.NODE_ENV === "development" && { devCode: code }),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent",
    });
  } catch (error) {
    console.error("Send code error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}

// Declare global type for verification codes storage
declare global {
  var verificationCodes: Map<string, { code: string; expiresAt: Date; verified: boolean }> | undefined;
}
