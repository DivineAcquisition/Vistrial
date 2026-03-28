// @ts-nocheck
// ============================================
// RESEND EMAIL SERVICE
// ============================================

import { Resend } from 'resend';

let _client: Resend | null = null;

function getResendClient(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  _client = new Resend(key);
  return _client;
}

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'Vistrial <noreply@mail.vistrial.io>';

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
      from: params.from || DEFAULT_FROM,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text || params.html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      reply_to: params.replyTo,
      tags: params.tags,
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
