// ============================================
// RESEND EMAIL CLIENT
// Email sending with Resend
// ============================================

import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailOptions {
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
  error?: string;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: options.from || process.env.RESEND_FROM_EMAIL || 'Vistrial <noreply@vistrial.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (error) {
    console.error('Email send error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Send a welcome email to new users
 */
export async function sendWelcomeEmail(
  to: string,
  userName: string,
  businessName: string
): Promise<SendEmailResult> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Vistrial</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #a39eff 0%, #6e47d1 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Welcome to Vistrial!</h1>
          </div>
          <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
              Hi ${userName},
            </p>
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
              Thank you for signing up! We're excited to help ${businessName} reactivate dormant customers and grow your revenue.
            </p>
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
              Here's what you can do next:
            </p>
            <ul style="color: #374151; font-size: 16px; line-height: 2; margin: 0 0 30px; padding-left: 20px;">
              <li>Upload your customer contacts</li>
              <li>Create your first reactivation campaign</li>
              <li>Watch the bookings roll in</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #a39eff 0%, #6e47d1 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Go to Dashboard
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0; text-align: center;">
              Questions? Reply to this email or reach out to our support team.
            </p>
          </div>
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            © ${new Date().getFullYear()} Vistrial. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Welcome to Vistrial, ${userName}!`,
    html,
    text: `Welcome to Vistrial, ${userName}! We're excited to help ${businessName} grow.`,
  });
}

/**
 * Send a campaign notification email
 */
export async function sendCampaignNotification(
  to: string,
  campaignName: string,
  stats: { sent: number; responses: number; bookings: number }
): Promise<SendEmailResult> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Campaign Update</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <h1 style="color: #111827; margin: 0 0 20px; font-size: 24px;">Campaign Update: ${campaignName}</h1>
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
              Here's how your campaign is performing:
            </p>
            <div style="display: flex; gap: 20px; margin-bottom: 30px;">
              <div style="flex: 1; background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: #6e47d1;">${stats.sent}</div>
                <div style="font-size: 14px; color: #6b7280;">Messages Sent</div>
              </div>
              <div style="flex: 1; background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: #6e47d1;">${stats.responses}</div>
                <div style="font-size: 14px; color: #6b7280;">Responses</div>
              </div>
              <div style="flex: 1; background: #ecfdf5; border-radius: 12px; padding: 20px; text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: #059669;">${stats.bookings}</div>
                <div style="font-size: 14px; color: #6b7280;">Bookings</div>
              </div>
            </div>
            <div style="text-align: center;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/analytics" style="display: inline-block; background: linear-gradient(135deg, #a39eff 0%, #6e47d1 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                View Full Report
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Campaign Update: ${campaignName}`,
    html,
  });
}

export { resend };
