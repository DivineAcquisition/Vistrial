// @ts-nocheck
// ============================================
// BOOKING NOTIFICATIONS
// Send SMS and email notifications for bookings
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

interface BookingNotificationData {
  bookingRequestId: string;
  organizationId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceName: string;
  estimatedPrice: number | null;
  priceType: string;
  preferredDate?: string;
  preferredTime?: string;
  source: string;
  bookingPageName?: string;
}

export async function sendBookingNotifications(data: BookingNotificationData) {
  const admin = getSupabaseAdminClient();

  const { data: org } = await admin
    .from('organizations')
    .select('*')
    .eq('id', data.organizationId)
    .single();

  if (!org) return { emailSent: false, smsSent: false, errors: ['Org not found'] };

  // Get notification settings from booking page
  const { data: bookingPage } = await admin.from('booking_pages').select('settings').eq('organization_id', data.organizationId).limit(1).maybeSingle();
  const settings = bookingPage?.settings || {};
  const notificationEmail = settings.notificationEmail || org.email;
  const results = { emailSent: false, smsSent: false, errors: [] as string[] };

  // Send email notification via Resend if configured
  if (notificationEmail && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const dashUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.io'}/booking/requests/${data.bookingRequestId}`;
      const priceText = data.priceType === 'quote' ? 'Quote requested' : data.estimatedPrice ? `$${data.estimatedPrice}` : '';
      const dateText = data.preferredDate ? `Preferred date: ${new Date(data.preferredDate).toLocaleDateString()}` : '';

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Vistrial <noreply@mail.vistrial.io>',
        to: notificationEmail,
        subject: `New Booking Request from ${data.customerName}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
          <div style="padding:24px;background:#f8fafc;border-radius:12px;margin-bottom:16px">
            <h2 style="margin:0 0 8px;color:#1a1a1a">New Booking Request!</h2>
            <p style="margin:0;color:#64748b">From ${data.bookingPageName || 'your booking page'}</p>
          </div>
          <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px">
            <p style="margin:0 0 12px"><strong>${data.customerName}</strong></p>
            <p style="margin:0 0 8px;color:#475569">Phone: <a href="tel:${data.customerPhone}">${data.customerPhone}</a></p>
            ${data.customerEmail ? `<p style="margin:0 0 8px;color:#475569">Email: <a href="mailto:${data.customerEmail}">${data.customerEmail}</a></p>` : ''}
            <p style="margin:0 0 8px;color:#475569">Service: <strong>${data.serviceName}</strong></p>
            ${priceText ? `<p style="margin:0 0 8px;color:#475569">Price: ${priceText}</p>` : ''}
            ${dateText ? `<p style="margin:0 0 8px;color:#475569">${dateText}</p>` : ''}
          </div>
          <div style="text-align:center;padding:16px">
            <a href="${dashUrl}" style="display:inline-block;padding:12px 32px;background:#5347d1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">View Request & Respond</a>
          </div>
          <p style="text-align:center;color:#94a3b8;font-size:13px;margin-top:16px">Responding within 5 minutes increases your booking rate by 80%!</p>
        </div>`,
      });
      results.emailSent = true;
    } catch (err) {
      console.error('Booking email notification failed:', err);
      results.errors.push('Email failed');
    }
  }

  // Log notification
  await admin.from('booking_request_activities').insert({
    booking_request_id: data.bookingRequestId,
    organization_id: data.organizationId,
    type: 'notification_sent',
    content: `Notifications sent: ${results.emailSent ? 'Email sent' : 'No email'} ${results.smsSent ? 'SMS sent' : ''}`.trim(),
  }).catch(() => {});

  return results;
}
