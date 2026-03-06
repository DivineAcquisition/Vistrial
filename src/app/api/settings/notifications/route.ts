// ============================================
// NOTIFICATION SETTINGS API - Saves to DB
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.user || !context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { personal, business, contacts } = body;
    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    // Update user personal preferences
    if (personal) {
      await admin.from('users').update({
        notification_preferences: {
          email: personal.emailEnabled,
          sms: personal.smsEnabled,
          push: personal.pushEnabled,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', context.user.id);
    }

    // Update org notification settings (owner/admin only)
    const membership = context.membership as Record<string, any> | null;
    const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    if (isOwnerOrAdmin && (business || contacts)) {
      const orgUpdate: Record<string, any> = { updated_at: new Date().toISOString() };

      if (business) {
        orgUpdate.notification_settings = {
          booking_email: business.bookingEmail,
          booking_sms: business.bookingSms,
          response_email: business.responseEmail,
          response_sms: business.responseSms,
          weekly_digest: business.weeklyDigest,
          usage_alerts: business.usageAlerts,
        };
      }

      if (contacts?.notificationEmail) orgUpdate.email = contacts.notificationEmail;
      if (contacts?.notificationPhone) orgUpdate.phone = contacts.notificationPhone;

      await admin.from('organizations').update(orgUpdate).eq('id', org.id);
    }

    return NextResponse.json({ message: 'Notification settings saved' });
  } catch (error) {
    console.error('Update notifications error:', error);
    return NextResponse.json({ error: 'Failed to update notification settings' }, { status: 500 });
  }
}
