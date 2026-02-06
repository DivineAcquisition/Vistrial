// ============================================
// RESEND EMAIL CLIENT
// Core email sending functionality
// ============================================

import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender for transactional emails
export const TRANSACTIONAL_FROM = 'Vistrial <notifications@mail.vistrial.com>';

// Default sender for campaign emails (on behalf of users)
export const CAMPAIGN_FROM = 'via Vistrial <campaigns@mail.vistrial.com>';

// Build "on behalf of" sender
export function buildCampaignSender(businessName: string): string {
  // Sanitize business name for email header
  const sanitized = businessName.replace(/[<>]/g, '').trim();
  return `${sanitized} via Vistrial <campaigns@mail.vistrial.com>`;
}

// Email sending options
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

// Send a single email
export async function sendEmail(options: SendEmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const { data, error } = await resend.emails.send({
      from: options.from || TRANSACTIONAL_FROM,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      tags: options.tags,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Send email error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Send batch emails (up to 100 at a time)
export async function sendBatchEmails(
  emails: Array<{
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    tags?: Array<{ name: string; value: string }>;
  }>
): Promise<{
  success: boolean;
  results?: Array<{ id: string }>;
  error?: string;
}> {
  try {
    const { data, error } = await resend.batch.send(
      emails.map((email) => ({
        from: email.from || TRANSACTIONAL_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: email.replyTo,
        tags: email.tags,
      }))
    );

    if (error) {
      console.error('Resend batch error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, results: data?.data };
  } catch (error) {
    console.error('Send batch email error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
