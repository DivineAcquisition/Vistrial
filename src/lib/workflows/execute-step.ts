// @ts-nocheck
// ============================================
// EXECUTE WORKFLOW STEP
// Handles SMS, Email, and Voice Drop execution
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendCampaignEmail, processEmailTemplate } from '@/lib/email/send-campaign';

interface ExecuteStepParams {
  enrollmentId: string;
  workflowId: string;
  stepIndex: number;
  contactId: string;
  organizationId: string;
}

// Process template variables
function processTemplate(template: string, variables: Record<string, string>): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    processed = processed.replace(regex, value || '');
  }
  return processed;
}

export async function executeWorkflowStep(params: ExecuteStepParams): Promise<{
  success: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}> {
  const admin = getSupabaseAdminClient();

  // Get workflow and step details
  const { data: workflow, error: workflowError } = await admin
    .from('workflows')
    .select('*')
    .eq('id', params.workflowId)
    .single();

  if (workflowError || !workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  const steps = workflow.steps as Array<{
    id: string;
    type: 'sms' | 'email' | 'voice_drop';
    template?: string;
    email_subject?: string;
    email_body?: string;
    email_cta_text?: string;
    email_cta_url?: string;
    voice_id?: string;
    voice_script?: string;
  }>;
  const step = steps[params.stepIndex];

  if (!step) {
    return { success: false, error: 'Step not found' };
  }

  // Get contact details
  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .select('*')
    .eq('id', params.contactId)
    .single();

  if (contactError || !contact) {
    return { success: false, error: 'Contact not found' };
  }

  // Get organization details
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('*')
    .eq('id', params.organizationId)
    .single();

  if (orgError || !org) {
    return { success: false, error: 'Organization not found' };
  }

  // Check contact status
  if (contact.status === 'unsubscribed') {
    return { success: false, skipped: true, skipReason: 'Contact unsubscribed' };
  }

  // Build template variables
  const settings = (org.settings || {}) as Record<string, string>;
  const variables: Record<string, string> = {
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
    business_name: org.name,
    business_phone: org.phone || '',
    booking_link: settings.booking_link || '',
    review_link: settings.review_link || '',
  };

  // Execute based on step type
  try {
    switch (step.type) {
      case 'sms': {
        if (!contact.phone) {
          return { success: false, skipped: true, skipReason: 'Contact has no phone' };
        }

        const message = processTemplate(step.template || '', variables);

        // Log the SMS message (actual sending would use Telnyx)
        await admin.from('messages').insert({
          organization_id: params.organizationId,
          contact_id: params.contactId,
          workflow_id: params.workflowId,
          workflow_step_id: step.id,
          type: 'sms',
          direction: 'outbound',
          content: message,
          status: 'queued',
          metadata: {},
        });

        return { success: true };
      }

      case 'email': {
        if (!contact.email) {
          return { success: false, skipped: true, skipReason: 'Contact has no email' };
        }

        const result = await sendCampaignEmail({
          organizationId: params.organizationId,
          contactId: params.contactId,
          workflowId: params.workflowId,
          workflowStepId: step.id,
          subject: step.email_subject || '',
          body: step.email_body || '',
          ctaText: step.email_cta_text,
          ctaUrl: step.email_cta_url,
        });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        return { success: true };
      }

      case 'voice_drop': {
        if (!contact.phone) {
          return { success: false, skipped: true, skipReason: 'Contact has no phone' };
        }

        const script = processTemplate(step.voice_script || '', variables);

        // Log the voice drop (actual delivery would use ElevenLabs + Telnyx)
        await admin.from('messages').insert({
          organization_id: params.organizationId,
          contact_id: params.contactId,
          workflow_id: params.workflowId,
          workflow_step_id: step.id,
          type: 'voice_drop',
          direction: 'outbound',
          content: script,
          status: 'queued',
          metadata: {
            voice_id: step.voice_id || 'rachel',
          },
        });

        return { success: true };
      }

      default:
        return { success: false, error: `Unknown step type: ${step.type}` };
    }
  } catch (error) {
    console.error('Execute step error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
