// @ts-nocheck
import { Resend } from "resend";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationCode(
  channel: "email" | "sms",
  destination: string,
  type: "signup" | "login" | "reset" = "signup"
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing codes for this destination
  if (channel === "email") {
    await admin.from("verification_codes").delete().eq("email", destination);
  } else {
    await admin.from("verification_codes").delete().eq("phone", destination);
  }

  // Store the code
  const { error: dbError } = await admin.from("verification_codes").insert({
    email: channel === "email" ? destination : null,
    phone: channel === "sms" ? destination : null,
    code,
    type,
    channel,
    expires_at: expiresAt.toISOString(),
  });

  if (dbError) {
    console.error("Failed to store verification code:", dbError);
    return { success: false, error: "Failed to create verification code" };
  }

  // Send the code
  if (channel === "email") {
    if (!resend) {
      console.log(`[DEV] Email verification code for ${destination}: ${code}`);
      return { success: true };
    }

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Vistrial <noreply@vistrial.io>",
        to: destination,
        subject: "Your Vistrial verification code",
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #7c3aed; margin-bottom: 20px;">Verify your email</h1>
            <p style="color: #64748b; margin-bottom: 20px;">
              Enter this code to ${type === "signup" ? "complete your signup" : "verify your identity"}:
            </p>
            <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e293b;">
                ${code}
              </span>
            </div>
            <p style="color: #94a3b8; font-size: 14px;">
              This code expires in 10 minutes. If you didn't request this, please ignore this email.
            </p>
          </div>
        `,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to send email:", error);
      return { success: false, error: "Failed to send verification email" };
    }
  } else {
    // SMS
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      console.log(`[DEV] SMS verification code for ${destination}: ${code}`);
      return { success: true };
    }

    try {
      await twilioClient.messages.create({
        body: `Your Vistrial verification code is: ${code}. Expires in 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: destination,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to send SMS:", error);
      return { success: false, error: "Failed to send verification SMS" };
    }
  }
}

export async function verifyCode(
  channel: "email" | "sms",
  destination: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  const query = admin
    .from("verification_codes")
    .select("*")
    .eq("code", code)
    .eq("channel", channel)
    .eq("verified", false)
    .gt("expires_at", new Date().toISOString());

  if (channel === "email") {
    query.eq("email", destination);
  } else {
    query.eq("phone", destination);
  }

  const { data: verification, error } = await query.maybeSingle();

  if (error || !verification) {
    return { success: false, error: "Invalid or expired code" };
  }

  // Mark as verified
  await admin
    .from("verification_codes")
    .update({ verified: true })
    .eq("id", verification.id);

  return { success: true };
}
