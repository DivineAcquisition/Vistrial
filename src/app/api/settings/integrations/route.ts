import { NextResponse } from "next/server";

export async function GET() {
  // Check which integrations are configured via environment variables
  const status = {
    twilio: !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    ),
    stripe: !!process.env.STRIPE_SECRET_KEY,
    resend: !!process.env.RESEND_API_KEY,
  };

  return NextResponse.json({ status });
}
