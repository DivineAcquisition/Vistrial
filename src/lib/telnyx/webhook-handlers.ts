// ============================================
// TELNYX WEBHOOK HANDLERS
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { formatE164 } from './send-sms';

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL', 'REMOVE', 'OPTOUT'];
const OPT_IN_KEYWORDS = ['START', 'YES', 'UNSTOP', 'SUBSCRIBE', 'OPTIN'];

/**
 * Handle inbound SMS message
 */
export async function handleInboundMessage(payload: any) {
  const admin = getSupabaseAdminClient();

  const data = payload.data?.payload || payload.data || payload;

  const fromNumber = formatE164(data.from?.phone_number || data.from || '');
  const toNumber = formatE164(data.to?.[0]?.phone_number || data.to || '');
  const messageText = data.text || '';
  const externalId = data.id;

  console.log('Inbound SMS:', { from: fromNumber, to: toNumber, text: messageText });

  // Find organization by Telnyx number
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, notification_settings, email, phone')
    .eq('telnyx_phone_number', toNumber)
    .single();

  if (!org) {
    console.error('No organization found for number:', toNumber);
    return { success: false, error: 'Organization not found' };
  }

  // Find or create contact
  let contact: any;
  const { data: existingContact } = await admin
    .from('contacts')
    .select('*')
    .eq('organization_id', org.id)
    .eq('phone', fromNumber)
    .single();

  if (existingContact) {
    contact = existingContact;
  } else {
    const { data: newContact, error } = await admin
      .from('contacts')
      .insert({
        organization_id: org.id,
        first_name: 'Unknown',
        phone: fromNumber,
        status: 'active',
        source: 'inbound_sms',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create contact:', error);
      return { success: false, error: 'Failed to create contact' };
    }
    contact = newContact;
  }

  // Check for opt-out/opt-in keywords
  const upperText = messageText.toUpperCase().trim();
  const isOptOut = OPT_OUT_KEYWORDS.some((kw) => upperText === kw || upperText.startsWith(kw + ' '));
  const isOptIn = OPT_IN_KEYWORDS.some((kw) => upperText === kw || upperText.startsWith(kw + ' '));

  if (isOptOut) {
    await handleOptOut(org.id, contact.id, fromNumber, admin);
  } else if (isOptIn) {
    await handleOptIn(contact.id, admin);
  }

  // Create message record
  const { data: message, error: msgError } = await admin
    .from('messages')
    .insert({
      organization_id: org.id,
      contact_id: contact.id,
      type: 'sms',
      direction: 'inbound',
      content: messageText,
      phone: fromNumber,
      status: 'received',
      external_id: externalId,
    })
    .select()
    .single();

  if (msgError) {
    console.error('Failed to create message:', msgError);
  }

  // Update contact's last_response
  await admin
    .from('contacts')
    .update({ last_response: new Date().toISOString() })
    .eq('id', contact.id);

  // Check if contact is in active workflow enrollment — stop on response
  const { data: activeEnrollments } = await admin
    .from('workflow_enrollments')
    .select('id, workflow_id')
    .eq('contact_id', contact.id)
    .eq('organization_id', org.id)
    .eq('status', 'active');

  if (activeEnrollments && activeEnrollments.length > 0) {
    for (const enrollment of activeEnrollments) {
      await admin
        .from('workflow_enrollments')
        .update({
          status: 'responded',
          outcome: 'responded',
          responded_at: new Date().toISOString(),
          stopped_at: new Date().toISOString(),
          stop_reason: 'customer_responded',
        })
        .eq('id', enrollment.id);

      // Cancel pending scheduled steps
      await admin
        .from('scheduled_steps')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'customer_responded',
        })
        .eq('enrollment_id', enrollment.id)
        .eq('status', 'pending');
    }
  }

  return { success: true, messageId: message?.id };
}

/**
 * Handle delivery status update
 */
export async function handleDeliveryStatus(payload: any) {
  const admin = getSupabaseAdminClient();

  const data = payload.data?.payload || payload.data || payload;
  const externalId = data.id;
  const status = data.to?.[0]?.status || data.status;

  console.log('Delivery status:', { externalId, status });

  let dbStatus = 'sent';
  if (status === 'delivered' || status === 'delivery_confirmed') {
    dbStatus = 'delivered';
  } else if (status === 'sending_failed' || status === 'delivery_failed' || status === 'failed') {
    dbStatus = 'failed';
  } else if (status === 'sent' || status === 'queued') {
    dbStatus = 'sent';
  }

  const updateData: any = { status: dbStatus };
  if (dbStatus === 'delivered') updateData.delivered_at = new Date().toISOString();
  if (dbStatus === 'failed') updateData.error_message = data.errors?.[0]?.detail || 'Delivery failed';

  const { error } = await admin
    .from('messages')
    .update(updateData)
    .eq('external_id', externalId);

  if (error) {
    console.error('Failed to update message status:', error);
    return { success: false, error: 'Failed to update message' };
  }

  return { success: true };
}

/**
 * Handle opt-out
 */
async function handleOptOut(organizationId: string, contactId: string, phoneNumber: string, admin: any) {
  await admin.from('contacts').update({ status: 'unsubscribed' }).eq('id', contactId);

  await admin
    .from('workflow_enrollments')
    .update({ status: 'stopped', stopped_at: new Date().toISOString(), stop_reason: 'opt_out' })
    .eq('contact_id', contactId)
    .eq('status', 'active');

  const { data: enrollments } = await admin
    .from('workflow_enrollments')
    .select('id')
    .eq('contact_id', contactId);

  if (enrollments) {
    const enrollmentIds = enrollments.map((e: any) => e.id);
    if (enrollmentIds.length > 0) {
      await admin
        .from('scheduled_steps')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'opt_out' })
        .in('enrollment_id', enrollmentIds)
        .eq('status', 'pending');
    }
  }

  console.log('Processed opt-out for:', phoneNumber);
}

/**
 * Handle opt-in (resubscribe)
 */
async function handleOptIn(contactId: string, admin: any) {
  await admin.from('contacts').update({ status: 'active' }).eq('id', contactId);
  console.log('Processed opt-in for contact:', contactId);
}
