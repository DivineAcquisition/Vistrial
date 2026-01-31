import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, otp } = body

    if (!email || !otp) {
      return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 })
    }

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: "Invalid OTP format" }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: verificationData, error: fetchError } = await adminClient
      .from("verification_codes")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("code", otp)
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !verificationData) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    if (new Date(verificationData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Verification code has expired" }, { status: 400 })
    }

    await adminClient
      .from("verification_codes")
      .update({ verified: true })
      .eq("id", verificationData.id)

    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: true,
      user_metadata: {
        full_name: verificationData.full_name,
        phone: verificationData.phone,
      },
    })

    if (createError) {
      if (createError.message.includes("already exists")) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 })
      }
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
    }

    if (userData.user) {
      await adminClient.from("profiles").insert({
        id: userData.user.id,
        email: email.toLowerCase(),
        full_name: verificationData.full_name,
        phone: verificationData.phone,
        onboarding_completed: false,
      })
    }

    await adminClient
      .from("verification_codes")
      .delete()
      .eq("email", email.toLowerCase())
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    return NextResponse.json({
      success: true,
      message: "Account verified successfully",
      user: userData.user ? {
        id: userData.user.id,
        email: userData.user.email,
        name: verificationData.full_name,
      } : null,
    })
  } catch (error) {
    console.error("Verify OTP error:", error)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}
