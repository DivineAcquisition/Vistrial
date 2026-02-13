// ============================================
// BUSINESS NOTIFICATION SERVICE
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/resend/send-email';
import { sendSMS } from '@/lib/telnyx/send-sms';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.io';

export interface NotifyParams {
  organizationId: string;
  type: 'new_booking' | 'new_response' | 'usage_alert' | 'weekly_digest';
  data: any;
}

/**
 * Send notification to business owner
 */
export async function notifyBusiness(params: NotifyParams): Promise<void> {
  const { organizationId, type, data } = params;
  const admin = getSupabaseAdminClient();

  const { data: org } = await admin
    .from('organizations')
    .select('name, email, phone, telnyx_phone_number, notification_settings')
    .eq('id', organizationId)
    .single();

  if (!org) {
    console.error('Organization not found for notification');
    return;
  }

  const settings = org.notification_settings || {};

  switch (type) {
    case 'new_booking':
      await notifyNewBooking(org, settings, data);
      break;
    case 'new_response':
      await notifyNewResponse(org, settings, data);
      break;
    case 'usage_alert':
      await notifyUsageAlert(org, settings, data);
      break;
    default:
      console.log('Unknown notification type:', type);
  }
}

async function notifyNewBooking(org: any, settings: any, data: any) {
  const { customerName, serviceName, estimatedPrice, bookingId } = data;

  if (settings.booking_email !== false && org.email) {
    await sendEmail({
      to: org.email,
      subject: `New Booking Request from ${customerName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">New Booking Request</h2>
          <p>You have a new booking request from <strong>${customerName}</strong>.</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px;"><strong>Service:</strong> ${serviceName}</p>
            ${estimatedPrice ? `<p style="margin: 0;"><strong>Estimated Price:</strong> $${estimatedPrice}</p>` : ''}
          </div>
          <a href="${APP_URL}/booking/requests/${bookingId}" style="display: inline-block; background: #0066ff; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">View Request</a>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">- ${org.name} via Vistrial</p>
        </div>
      `,
    });
  }

  if (settings.booking_sms && org.phone && org.telnyx_phone_number) {
    await sendSMS({
      to: org.phone,
      from: org.telnyx_phone_number,
      text: `New booking request from ${customerName} for ${serviceName}. View: ${APP_URL}/booking/requests/${bookingId}`,
    });
  }
}

async function notifyNewResponse(org: any, settings: any, data: any) {
  const { contactName, messageContent } = data;

  if (settings.response_email !== false && org.email) {
    await sendEmail({
      to: org.email,
      subject: `New Reply from ${contactName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">New Customer Reply</h2>
          <p><strong>${contactName}</strong> replied to your message:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066ff;">
            <p style="margin: 0; white-space: pre-wrap;">${messageContent}</p>
          </div>
          <a href="${APP_URL}/inbox" style="display: inline-block; background: #0066ff; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">View Conversation</a>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">- ${org.name} via Vistrial</p>
        </div>
      `,
    });
  }

  if (settings.response_sms && org.phone && org.telnyx_phone_number) {
    await sendSMS({
      to: org.phone,
      from: org.telnyx_phone_number,
      text: `${contactName} replied: "${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}"`,
    });
  }
}

async function notifyUsageAlert(org: any, settings: any, data: any) {
  const { usageType, current, limit, percentage } = data;

  if (settings.usage_alerts !== false && org.email) {
    await sendEmail({
      to: org.email,
      subject: `Usage Alert: ${percentage}% of ${usageType} limit reached`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Usage Alert</h2>
          <p>You have used <strong>${percentage}%</strong> of your monthly ${usageType} limit.</p>
          <div style="background: #fff3cd; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffc107;">
            <p style="margin: 0;"><strong>${current}</strong> of <strong>${limit}</strong> ${usageType} used this month</p>
          </div>
          <p>Consider upgrading your plan to avoid interruptions.</p>
          <a href="${APP_URL}/settings/billing" style="display: inline-block; background: #0066ff; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">View Plans</a>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">- Vistrial</p>
        </div>
      `,
    });
  }
}
