export function resendConfigured(env = process.env): { apiKey: string; from: string } | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function vapidConfigured(env = process.env): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim() || "mailto:ops@vistrial.io";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function twilioConfigured(env = process.env): {
  accountSid: string;
  authToken: string;
  from: string;
} | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

export function resendWebhookSecret(env = process.env): string | null {
  return env.RESEND_WEBHOOK_SECRET?.trim() || null;
}
