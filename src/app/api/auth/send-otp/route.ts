import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fullName, email, phone, resend } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    if (!resend && (!fullName || !phone)) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: existingUser } = await supabase.auth.admin.listUsers()
    if (existingUser?.users?.some((u) => u.email === email.toLowerCase())) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 })
    }

    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    let userName = fullName
    let userPhone = phone

    if (resend) {
      const { data: existingCode } = await supabase
        .from("verification_codes")
        .select("full_name, phone")
        .eq("email", email.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (existingCode) {
        userName = existingCode.full_name
        userPhone = existingCode.phone
      }
    }

    await supabase.from("verification_codes").insert({
      email: email.toLowerCase(),
      code: otp,
      full_name: userName || "User",
      phone: userPhone || "",
      expires_at: expiresAt.toISOString(),
    })

    // Log OTP for development (remove in production)
    console.log(`[OTP for ${email}]: ${otp}`)

    return NextResponse.json({
      success: true,
      message: "Verification code sent",
      ...(process.env.NODE_ENV === "development" && { debug_otp: otp }),
    })
  } catch (error) {
    console.error("Send OTP error:", error)
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 })
  }
}
