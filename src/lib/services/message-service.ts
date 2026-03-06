// ============================================
// MESSAGE SERVICE
// Handles sending messages and tracking
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendSMS } from '@/lib/telnyx/send-sms';
import { sendEmail } from '@/lib/resend/send-email';

export interface SendMessageParams {
  organizationId: string;
  contactId: string;
  type: 'sms' | 'email';
  content: string;
  subject?: string;
  workflowId?: string;
  enrollmentId?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  dbMessageId?: string;
  error?: string;
  isOverage?: boolean;
}

/**
 * Get organization's message limits based on plan
 */
function getPlanLimits(plan: string | null): { sms: number; email: number } {
  switch (plan) {
    case 'lite': return { sms: 500, email: 1000 };
    case 'pro': return { sms: 2000, email: 5000 };
    case 'agency': return { sms: 10000, email: 25000 };
    default: return { sms: 100, email: 100 };
  }
}

/**
 * Check usage and determine if overage
 */
async function checkUsage(
  organizationId: string,
  type: 'sms' | 'email'
): Promise<{ count: number; limit: number; isOverage: boolean }> {
  const admin = getSupabaseAdminClient();

  const { data: org } = await admin
    .from('organizations')
    .select('subscription_plan, subscription_status')
    .eq('id', organizationId)
    .single();

  const limits = getPlanLimits(org?.subscription_plan);
  const limit = type === 'sms' ? limits.sms : limits.email;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await admin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('type', type)
    .eq('direction', 'outbound')
    .gte('created_at', startOfMonth.toISOString());

  return { count: count || 0, limit, isOverage: (count || 0) >= limit };
}

/**
 * Send a message (SMS or Email)
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { organizationId, contactId, type, content, subject, workflowId, enrollmentId } = params;
  const admin = getSupabaseAdminClient();

  try {
    const [{ data: org }, { data: contact }] = await Promise.all([
      admin.from('organizations').select('telnyx_phone_number, email, name').eq('id', organizationId).single(),
      admin.from('contacts').select('phone, email, first_name, last_name').eq('id', contactId).single(),
    ]);

    if (!org) return { success: false, error: 'Organization not found' };
    if (!contact) return { success: false, error: 'Contact not found' };

    const usage = await checkUsage(organizationId, type);

    // Create message record
    const messageRecord: any = {
      organization_id: organizationId,
      contact_id: contactId,
      type,
      direction: 'outbound',
      content,
      subject: type === 'email' ? subject : null,
      phone: type === 'sms' ? contact.phone : null,
      email: type === 'email' ? contact.email : null,
      status: 'pending',
      workflow_id: workflowId,
      enrollment_id: enrollmentId,
      is_overage: usage.isOverage,
    };

    const { data: message, error: insertError } = await admin
      .from('messages')
      .insert(messageRecord)
      .select()
      .single();

    if (insertError || !message) {
      console.error('Failed to create message record:', insertError);
      return { success: false, error: 'Failed to create message record' };
    }

    let sendResult: { success: boolean; messageId?: string; error?: string };

    if (type === 'sms') {
      if (!org.telnyx_phone_number) {
        await admin.from('messages').update({ status: 'failed', error_message: 'No Telnyx phone number configured' }).eq('id', message.id);
        return { success: false, error: 'No Telnyx phone number configured' };
      }
      if (!contact.phone) {
        await admin.from('messages').update({ status: 'failed', error_message: 'Contact has no phone number' }).eq('id', message.id);
        return { success: false, error: 'Contact has no phone number' };
      }
      sendResult = await sendSMS({ to: contact.phone, from: org.telnyx_phone_number, text: content });
    } else {
      if (!contact.email) {
        await admin.from('messages').update({ status: 'failed', error_message: 'Contact has no email' }).eq('id', message.id);
        return { success: false, error: 'Contact has no email' };
      }
      sendResult = await sendEmail({ to: contact.email, subject: subject || 'Message from ' + org.name, html: content });
    }

    if (sendResult.success) {
      await admin.from('messages').update({ status: 'sent', external_id: sendResult.messageId, sent_at: new Date().toISOString() }).eq('id', message.id);
      await admin.from('contacts').update({ last_contacted: new Date().toISOString() }).eq('id', contactId);
      return { success: true, messageId: sendResult.messageId, dbMessageId: message.id, isOverage: usage.isOverage };
    } else {
      await admin.from('messages').update({ status: 'failed', error_message: sendResult.error }).eq('id', message.id);
      return { success: false, error: sendResult.error, dbMessageId: message.id };
    }
  } catch (error) {
    console.error('sendMessage error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send message' };
  }
}

/**
 * Send a quick reply from inbox
 */
export async function sendQuickReply(
  organizationId: string,
  contactId: string,
  content: string
): Promise<SendMessageResult> {
  return sendMessage({ organizationId, contactId, type: 'sms', content });
}
