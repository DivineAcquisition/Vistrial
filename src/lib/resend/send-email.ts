// ============================================
// RESEND EMAIL SERVICE
// ============================================

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'Vistrial <notifications@vistrial.io>';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  messageId?: string;
  error?: string;
}

/**
 * Send an email via Resend
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, html, text, from = EMAIL_FROM, replyTo } = params;

  try {
    const { data, error } = await resend.emails.send({
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
