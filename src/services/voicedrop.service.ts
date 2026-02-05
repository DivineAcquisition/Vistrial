// @ts-nocheck
// ============================================
// VOICE DROP SERVICE
// High-level voice drop operations
// ============================================

import {
  generateSpeech,
  uploadAudioToStorage,
  deliverVoiceDrop,
  estimateVoiceDropDuration,
  getDefaultVoiceId,
} from '@/lib/elevenlabs';
import { processMessageTemplate, formatToE164, isValidPhoneNumber } from '@/lib/telnyx';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getMessageCost } from '@/lib/stripe/prices';
import { buildTemplateVariables } from './messaging.service';
import type {
  Contact,
  Organization,
  Workflow,
  WorkflowEnrollment,
  MessageInsert,
} from '@/types/database';
import type { WorkflowStep } from '@/types/workflows';

// ============================================
// VOICE DROP SENDING
// ============================================

export interface SendVoiceDropParams {
  organizationId: string;
  contactId: string;
  text: string;
  voiceId?: string;
  workflowId?: string;
  enrollmentId?: string;
  stepIndex?: number;
}

export interface SendVoiceDropResult {
  success: boolean;
  messageId?: string;
  dbMessageId?: string;
  audioUrl?: string;
  durationSeconds?: number;
  costCents: number;
  error?: string;
}

/**
 * Send voice drop to a contact
 */
export async function sendVoiceDrop(
  params: SendVoiceDropParams
): Promise<SendVoiceDropResult> {
  const admin = getSupabaseAdminClient();

  // Get contact
  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .select('*')
    .eq('id', params.contactId)
    .single();

  if (contactError || !contact) {
    return {
      success: false,
      costCents: 0,
      error: 'Contact not found',
    };
  }

  // Validate phone
  if (!contact.phone || !isValidPhoneNumber(contact.phone)) {
    return {
      success: false,
      costCents: 0,
      error: 'Invalid phone number',
    };
  }

  // Check opt-in status
  if (!contact.voice_opted_in) {
    return {
      success: false,
      costCents: 0,
      error: 'Contact has opted out of voice messages',
    };
  }

  if (contact.status === 'unsubscribed' || contact.status === 'do_not_contact') {
    return {
      success: false,
      costCents: 0,
      error: `Contact status is ${contact.status}`,
    };
  }

  // Calculate cost
  const costCents = Math.ceil(getMessageCost('voice_drop'));

  // Check credit balance
  const { data: credits } = await admin
    .from('credit_balances')
    .select('balance_cents')
    .eq('organization_id', params.organizationId)
    .single();

  if (!credits || credits.balance_cents < costCents) {
    return {
      success: false,
      costCents: 0,
      error: 'Insufficient credits',
    };
  }

  // Estimate duration
  const durationSeconds = estimateVoiceDropDuration(params.text);

  // Create message record (queued status)
  const messageInsert: MessageInsert = {
    organization_id: params.organizationId,
    contact_id: params.contactId,
    workflow_id: params.workflowId || null,
    enrollment_id: params.enrollmentId || null,
    step_index: params.stepIndex ?? null,
    type: 'voice_drop',
    status: 'queued',
    to_address: formatToE164(contact.phone),
    content: params.text,
    audio_duration_seconds: durationSeconds,
    cost_cents: costCents,
    queued_at: new Date().toISOString(),
    metadata: {
      voice_id: params.voiceId || getDefaultVoiceId(),
    },
  };

  const { data: message, error: messageError } = await admin
    .from('messages')
    .insert(messageInsert)
    .select()
    .single();

  if (messageError || !message) {
    return {
      success: false,
      costCents: 0,
      error: 'Failed to create message record',
    };
  }

  // Deduct credits
  const { data: deductSuccess } = await admin.rpc('deduct_credits', {
    p_organization_id: params.organizationId,
    p_amount_cents: costCents,
    p_description: `Voice drop to ${contact.phone}`,
  });

  if (!deductSuccess) {
    await admin
      .from('messages')
      .update({ status: 'failed', failed_at: new Date().toISOString() })
      .eq('id', message.id);

    return {
      success: false,
      dbMessageId: message.id,
      costCents: 0,
      error: 'Failed to deduct credits',
    };
  }

  // Generate speech
  const speechResult = await generateSpeech({
    text: params.text,
    voiceId: params.voiceId,
  });

  if (!speechResult.success || !speechResult.audioBuffer) {
    // Refund credits
    await admin.rpc('add_credits', {
      p_organization_id: params.organizationId,
      p_amount_cents: costCents,
      p_is_purchase: false,
    });

    await admin
      .from('messages')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        provider_error: speechResult.error,
      })
      .eq('id', message.id);

    return {
      success: false,
      dbMessageId: message.id,
      costCents: 0,
      error: speechResult.error || 'Failed to generate speech',
    };
  }

  // Upload audio to storage
  const fileName = `${message.id}.mp3`;
  const uploadResult = await uploadAudioToStorage(
    speechResult.audioBuffer,
    fileName,
    params.organizationId
  );

  if (!uploadResult.success || !uploadResult.url) {
    // Refund credits
    await admin.rpc('add_credits', {
      p_organization_id: params.organizationId,
      p_amount_cents: costCents,
      p_is_purchase: false,
    });

    await admin
      .from('messages')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        provider_error: uploadResult.error,
      })
      .eq('id', message.id);

    return {
      success: false,
      dbMessageId: message.id,
      costCents: 0,
      error: uploadResult.error || 'Failed to upload audio',
    };
  }

  // Update message with audio URL
  await admin
    .from('messages')
    .update({
      audio_url: uploadResult.url,
      audio_duration_seconds: speechResult.durationSeconds,
    })
    .eq('id', message.id);

  // Deliver voice drop
  const deliveryResult = await deliverVoiceDrop({
    to: formatToE164(contact.phone),
    audioUrl: uploadResult.url,
    metadata: {
      message_id: message.id,
      organization_id: params.organizationId,
      contact_id: params.contactId,
    },
  });

  if (!deliveryResult.success) {
    // Refund credits on delivery failure
    await admin.rpc('add_credits', {
      p_organization_id: params.organizationId,
      p_amount_cents: costCents,
      p_is_purchase: false,
    });

    await admin
      .from('messages')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        provider_error: deliveryResult.error,
      })
      .eq('id', message.id);

    return {
      success: false,
      dbMessageId: message.id,
      audioUrl: uploadResult.url,
      costCents: 0,
      error: deliveryResult.error || 'Failed to deliver voice drop',
    };
  }

  // Update message as sent
  await admin
    .from('messages')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider: 'elevenlabs',
      provider_message_id: deliveryResult.dropId,
    })
    .eq('id', message.id);

  // Update contact last_contacted_at
  await admin
    .from('contacts')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('id', params.contactId);

  return {
    success: true,
    messageId: deliveryResult.dropId,
    dbMessageId: message.id,
    audioUrl: uploadResult.url,
    durationSeconds: speechResult.durationSeconds,
    costCents,
  };
}

/**
 * Send voice drop for workflow step
 */
export async function sendWorkflowVoiceDrop(params: {
  enrollment: WorkflowEnrollment;
  contact: Contact;
  organization: Organization;
  workflow: Workflow;
  step: WorkflowStep;
  stepIndex: number;
}): Promise<SendVoiceDropResult> {
  const { enrollment, contact, organization, workflow, step, stepIndex } = params;

  // Build template variables
  const variables = buildTemplateVariables(contact, organization);

  // Process template
  const content = processMessageTemplate(step.template, variables);

  return sendVoiceDrop({
    organizationId: organization.id,
    contactId: contact.id,
    text: content,
    voiceId: step.voice_id,
    workflowId: workflow.id,
    enrollmentId: enrollment.id,
    stepIndex,
  });
}

// ============================================
// VOICE PREVIEW
// ============================================

/**
 * Generate voice preview (for workflow builder)
 * Returns audio URL without sending to contact
 */
export async function generateVoicePreview(params: {
  text: string;
  voiceId?: string;
  organizationId: string;
}): Promise<{
  success: boolean;
  audioUrl?: string;
  durationSeconds?: number;
  error?: string;
}> {
  // Limit preview text length
  const previewText = params.text.slice(0, 500);

  const speechResult = await generateSpeech({
    text: previewText,
    voiceId: params.voiceId,
  });

  if (!speechResult.success || !speechResult.audioBuffer) {
    return {
      success: false,
      error: speechResult.error,
    };
  }

  // Upload to storage with preview prefix
  const fileName = `preview_${Date.now()}.mp3`;
  const uploadResult = await uploadAudioToStorage(
    speechResult.audioBuffer,
    fileName,
    params.organizationId
  );

  if (!uploadResult.success) {
    return {
      success: false,
      error: uploadResult.error,
    };
  }

  return {
    success: true,
    audioUrl: uploadResult.url,
    durationSeconds: speechResult.durationSeconds,
  };
}

// ============================================
// BATCH VOICE DROPS
// ============================================

export interface BatchVoiceDropParams {
  organizationId: string;
  contacts: Array<{
    contactId: string;
    text: string;
  }>;
  voiceId?: string;
  workflowId?: string;
  delayBetweenMs?: number;
}

export interface BatchVoiceDropResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    contactId: string;
    result: SendVoiceDropResult;
  }>;
}

/**
 * Send batch voice drops with rate limiting
 */
export async function sendBatchVoiceDrops(
  params: BatchVoiceDropParams
): Promise<BatchVoiceDropResult> {
  const results: BatchVoiceDropResult['results'] = [];
  const delayMs = params.delayBetweenMs || 500; // Default 500ms between drops

  for (const item of params.contacts) {
    const result = await sendVoiceDrop({
      organizationId: params.organizationId,
      contactId: item.contactId,
      text: item.text,
      voiceId: params.voiceId,
      workflowId: params.workflowId,
    });

    results.push({
      contactId: item.contactId,
      result,
    });

    // Rate limiting delay
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: params.contacts.length,
    successful: results.filter((r) => r.result.success).length,
    failed: results.filter((r) => !r.result.success).length,
    results,
  };
}
