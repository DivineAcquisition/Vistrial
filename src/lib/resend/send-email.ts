// @ts-nocheck
// ============================================
// RESEND EMAIL SERVICE (consolidated)
// Single source of truth for sending emails
// ============================================

import { Resend } from 'resend';

function getResendClient() { const k = process.env.RESEND_API_KEY; if (!k) throw new Error("RESEND_API_KEY not set"); return new Resend(k); }
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'Vistrial <notifications@vistrial.io>';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  messageId?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const { data, error } = await getResendClient().emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || stripHtml(html),
      replyTo,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id, messageId: data?.id };
  } catch (error) {
    console.error('sendEmail error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

export { getResend };
