import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and code are required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    let isValid = false;

    // Try to verify from database first
    try {
      const { data: verification } = await supabase
        .from("verification_codes")
        .select("*")
        .eq("email", email)
        .eq("code", code)
        .single();

      if (verification) {
        const expiresAt = new Date(verification.expires_at);
        if (expiresAt > new Date() && !verification.verified) {
          isValid = true;
          // Mark as verified
          await supabase
            .from("verification_codes")
            .update({ verified: true })
            .eq("email", email);
        }
      }
    } catch (dbError) {
      console.log("Checking memory storage for verification code");
      // Fall back to memory storage
      if (global.verificationCodes) {
        const stored = global.verificationCodes.get(email);
        if (stored && stored.code === code && stored.expiresAt > new Date() && !stored.verified) {
          isValid = true;
          stored.verified = true;
        }
      }
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json(
      { error: "Failed to verify code" },
      { status: 500 }
    );
  }
}

// Also support GET for checking verification status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "Email is required" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  let isVerified = false;

  try {
    const { data: verification } = await supabase
      .from("verification_codes")
      .select("verified")
      .eq("email", email)
      .single();

    isVerified = verification?.verified || false;
  } catch {
    // Check memory storage
    if (global.verificationCodes) {
      const stored = global.verificationCodes.get(email);
      isVerified = stored?.verified || false;
    }
  }

  return NextResponse.json({ verified: isVerified });
}
