// @ts-nocheck
// ============================================
// CAMPAIGN EMAIL SENDER
// Send emails on behalf of users to their customers
// ============================================

import { render } from '@react-email/components';
import { sendEmail, sendBatchEmails, buildCampaignSender } from './client';
import { CampaignEmail } from './templates/campaign-email';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.com';

interface SendCampaignEmailParams {
  organizationId: string;
  contactId: string;
  workflowId?: string;
  workflowStepId?: string;
  subject: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

// Process template variables in email content
export function processEmailTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let processed = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    processed = processed.replace(regex, value || '');
  }

  return processed;
}

// Send a single campaign email
export async function sendCampaignEmail(
  params: SendCampaignEmailParams
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const admin = getSupabaseAdminClient();

  // Get organization and contact details
  const [orgResult, contactResult] = await Promise.all([
    admin
      .from('organizations')
      .select('name, email, settings')
      .eq('id', params.organizationId)
      .single(),
    admin
      .from('contacts')
      .select('id, first_name, last_name, email, status')
      .eq('id', params.contactId)
      .single(),
  ]);

  if (orgResult.error || !orgResult.data) {
    return { success: false, error: 'Organization not found' };
  }

  if (contactResult.error || !contactResult.data) {
    return { success: false, error: 'Contact not found' };
  }

  const org = orgResult.data;
  const contact = contactResult.data;

  // Check contact has email and is not unsubscribed
  if (!contact.email) {
    return { success: false, error: 'Contact has no email address' };
  }

  if (contact.status === 'unsubscribed') {
    return { success: false, error: 'Contact has unsubscribed' };
  }

  // Build template variables
  const settings = (org.settings || {}) as Record<string, string>;
  const variables: Record<string, string> = {
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
    business_name: org.name,
    booking_link: settings.booking_link || '',
    review_link: settings.review_link || '',
  };

  // Process template
  const processedSubject = processEmailTemplate(params.subject, variables);
  const processedBody = processEmailTemplate(params.body, variables);
  const processedCtaText = params.ctaText
    ? processEmailTemplate(params.ctaText, variables)
    : undefined;
  const processedCtaUrl = params.ctaUrl
    ? processEmailTemplate(params.ctaUrl, variables)
    : undefined;

  // Generate unsubscribe URL
  const unsubscribeUrl = `${APP_URL}/unsubscribe?contact=${contact.id}&org=${params.organizationId}`;

  // Render email HTML
  const html = await render(
    CampaignEmail({
      businessName: org.name,
      subject: processedSubject,
      body: processedBody,
      ctaText: processedCtaText,
      ctaUrl: processedCtaUrl,
      unsubscribeUrl,
    })
  );

  // Send email
  const result = await sendEmail({
    to: contact.email,
    subject: processedSubject,
    html,
    from: buildCampaignSender(org.name),
    replyTo: org.email || undefined,
    tags: [
      { name: 'type', value: 'campaign' },
      { name: 'organization_id', value: params.organizationId },
      { name: 'contact_id', value: params.contactId },
      ...(params.workflowId
        ? [{ name: 'workflow_id', value: params.workflowId }]
        : []),
    ],
  });

  // Log the email in messages table
  if (result.success) {
    await admin.from('messages').insert({
      organization_id: params.organizationId,
      contact_id: params.contactId,
      workflow_id: params.workflowId || null,
      workflow_step_id: params.workflowStepId || null,
      type: 'email',
      direction: 'outbound',
      content: processedBody,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        subject: processedSubject,
        resend_message_id: result.messageId,
        cta_text: processedCtaText,
        cta_url: processedCtaUrl,
      },
    });
  }

  return result;
}

// Send batch campaign emails
export async function sendBatchCampaignEmails(
  organizationId: string,
  emails: Array<{
    contactId: string;
    subject: string;
    body: string;
    ctaText?: string;
    ctaUrl?: string;
    workflowId?: string;
    workflowStepId?: string;
  }>
): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors: Array<{ contactId: string; error: string }>;
}> {
  const results = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [] as Array<{ contactId: string; error: string }>,
  };

  // Process in batches of 10 to avoid rate limits
  const batchSize = 10;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((email) =>
        sendCampaignEmail({
          organizationId,
          contactId: email.contactId,
          subject: email.subject,
          body: email.body,
          ctaText: email.ctaText,
          ctaUrl: email.ctaUrl,
          workflowId: email.workflowId,
          workflowStepId: email.workflowStepId,
        })
      )
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const email = batch[j];

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({
          contactId: email.contactId,
          error: result.error || 'Unknown error',
        });
      }
    }

    // Small delay between batches
    if (i + batchSize < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  results.success = results.failed === 0;

  return results;
}
