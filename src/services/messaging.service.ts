// @ts-nocheck
// ============================================
// MESSAGING SERVICE
// High-level messaging operations
// ============================================

import {
  sendSms as telnyxSendSms,
  sendSmsWithRetry,
  processMessageTemplate,
  calculateSmsSegments,
  formatToE164,
  isValidPhoneNumber,
  detectMessageIntent,
  initiateCall,
} from '@/lib/telnyx';
import { textToSpeech } from '@/lib/elevenlabs/client';
import { getSupabaseAdminClient, getContactByPhone } from '@/lib/supabase/admin';
import { getMessageCost, CREDIT_COSTS } from '@/lib/stripe/prices';
import { contactsService } from './contacts.service';
import { creditsService } from './credits.service';
import type {
  Contact,
  Organization,
  Workflow,
  WorkflowEnrollment,
  Message,
  MessageInsert,
} from '@/types/database';
import type { TemplateVariables, WorkflowStep } from '@/types/workflows';

// Legacy import for backward compatibility
const createAdminClient = getSupabaseAdminClient;

// ============================================
// TEMPLATE VARIABLE BUILDING
// ============================================

/**
 * Build template variables from contact and organization
 */
export function buildTemplateVariables(
  contact: Contact,
  organization: Organization
): TemplateVariables {
  return {
    // Contact variables
    first_name: contact.first_name || 'there',
    last_name: contact.last_name || '',
    full_name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Valued Customer',
    email: contact.email || '',
    phone: contact.phone || '',

    // Business variables
    business_name: organization.name,
    business_phone: organization.phone || '',
    business_email: organization.email || '',
    business_website: organization.website || '',

    // Custom variables from organization settings
    review_link: (organization.settings as any)?.review_link || '',
    booking_link: (organization.settings as any)?.booking_link || '',
  };
}

// ============================================
// SMS SENDING
// ============================================

export interface SendMessageParams {
  organizationId: string;
  contactId: string;
  content: string;
  workflowId?: string;
  enrollmentId?: string;
  stepIndex?: number;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  dbMessageId?: string;
  costCents: number;
  error?: string;
}

/**
 * Send SMS message and record in database
 */
export async function sendSmsMessage(params: SendMessageParams): Promise<SendMessageResult> {
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

  // Check if contact has valid phone and is opted in
  if (!contact.phone || !isValidPhoneNumber(contact.phone)) {
    return {
      success: false,
      costCents: 0,
      error: 'Invalid phone number',
    };
  }

  if (!contact.sms_opted_in) {
    return {
      success: false,
      costCents: 0,
      error: 'Contact has opted out of SMS',
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
  const segments = calculateSmsSegments(params.content);
  const costCents = Math.ceil(getMessageCost('sms') * segments);

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

  // Create message record (queued status)
  const messageInsert: MessageInsert = {
    organization_id: params.organizationId,
    contact_id: params.contactId,
    workflow_id: params.workflowId || null,
    enrollment_id: params.enrollmentId || null,
    step_index: params.stepIndex ?? null,
    type: 'sms',
    status: 'queued',
    to_address: formatToE164(contact.phone),
    content: params.content,
    cost_cents: costCents,
    queued_at: new Date().toISOString(),
    metadata: {},
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
    p_description: `SMS to ${contact.phone}`,
  });

  if (!deductSuccess) {
    // Update message status to failed
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

  // Send via Telnyx
  const sendResult = await sendSmsWithRetry({
    to: contact.phone,
    text: params.content,
    metadata: {
      message_id: message.id,
      organization_id: params.organizationId,
      contact_id: params.contactId,
    },
  });

  // Update message record
  if (sendResult.success) {
    await admin
      .from('messages')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider: 'telnyx',
        provider_message_id: sendResult.messageId,
      })
      .eq('id', message.id);

    // Update contact last_contacted_at
    await admin
      .from('contacts')
      .update({ last_contacted_at: new Date().toISOString() })
      .eq('id', params.contactId);

    return {
      success: true,
      messageId: sendResult.messageId,
      dbMessageId: message.id,
      costCents,
    };
  } else {
    // Refund credits on failure
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
        provider_error: sendResult.error,
      })
      .eq('id', message.id);

    return {
      success: false,
      dbMessageId: message.id,
      costCents: 0,
      error: sendResult.error,
    };
  }
}

/**
 * Send workflow step message
 */
export async function sendWorkflowStepMessage(params: {
  enrollment: WorkflowEnrollment;
  contact: Contact;
  organization: Organization;
  workflow: Workflow;
  step: WorkflowStep;
  stepIndex: number;
}): Promise<SendMessageResult> {
  const { enrollment, contact, organization, workflow, step, stepIndex } = params;

  // Build template variables
  const variables = buildTemplateVariables(contact, organization);

  // Process template
  const content = processMessageTemplate(step.template, variables);

  // Send based on message type
  if (step.type === 'sms') {
    return sendSmsMessage({
      organizationId: organization.id,
      contactId: contact.id,
      content,
      workflowId: workflow.id,
      enrollmentId: enrollment.id,
      stepIndex,
    });
  }

  // Voice drops handled separately
  if (step.type === 'voice_drop') {
    // TODO: Implement voice drop sending
    return {
      success: false,
      costCents: 0,
      error: 'Voice drops not yet implemented',
    };
  }

  return {
    success: false,
    costCents: 0,
    error: `Unknown message type: ${step.type}`,
  };
}

// ============================================
// INBOUND MESSAGE PROCESSING
// ============================================

export interface InboundMessageParams {
  from: string;
  to: string;
  text: string;
  providerMessageId: string;
}

/**
 * Process inbound SMS message
 */
export async function processInboundMessage(params: InboundMessageParams): Promise<void> {
  const admin = getSupabaseAdminClient();

  // Find contacts with this phone number
  const { data: contacts } = await admin
    .from('contacts')
    .select('*, organizations(*)')
    .or(
      `phone.eq.${params.from},phone.eq.${params.from.replace('+', '')},phone.eq.${params.from.replace('+1', '')}`
    )
    .limit(10);

  if (!contacts || contacts.length === 0) {
    console.log('No contact found for inbound message from:', params.from);

    // Still record the message for potential matching later
    await admin.from('inbound_messages').insert({
      organization_id: null as any,
      type: 'sms',
      from_address: params.from,
      to_address: params.to,
      content: params.text,
      provider: 'telnyx',
      provider_message_id: params.providerMessageId,
      detected_intent: detectMessageIntent(params.text),
      received_at: new Date().toISOString(),
    });

    return;
  }

  // Process for each matching contact (usually just one)
  for (const contact of contacts) {
    const organization = contact.organizations as unknown as Organization;

    // Detect intent
    const intent = detectMessageIntent(params.text);

    // Record inbound message
    await admin.from('inbound_messages').insert({
      organization_id: organization.id,
      contact_id: contact.id,
      type: 'sms',
      from_address: params.from,
      to_address: params.to,
      content: params.text,
      provider: 'telnyx',
      provider_message_id: params.providerMessageId,
      detected_intent: intent,
      received_at: new Date().toISOString(),
    });

    // Handle opt-out
    if (intent === 'opt_out') {
      await handleOptOut(contact.id, organization.id);
    }

    // Handle opt-in (re-subscribe)
    if (intent === 'opt_in') {
      await handleOptIn(contact.id);
    }

    // Update contact last_response_at
    await admin
      .from('contacts')
      .update({ last_response_at: new Date().toISOString() })
      .eq('id', contact.id);

    // Check for active enrollments and handle response
    await handleEnrollmentResponse(contact.id, intent);
  }
}

/**
 * Handle contact opt-out
 */
async function handleOptOut(contactId: string, organizationId: string): Promise<void> {
  const admin = getSupabaseAdminClient();

  // Update contact
  await admin
    .from('contacts')
    .update({
      sms_opted_in: false,
      opted_out_at: new Date().toISOString(),
      status: 'unsubscribed',
    })
    .eq('id', contactId);

  // Exit all active enrollments
  await admin
    .from('workflow_enrollments')
    .update({
      status: 'unsubscribed',
      exit_reason: 'opted_out',
      exited_at: new Date().toISOString(),
    })
    .eq('contact_id', contactId)
    .eq('status', 'active');

  // Cancel any pending messages
  await admin
    .from('message_queue')
    .update({ status: 'canceled' })
    .eq('contact_id', contactId)
    .eq('status', 'pending');

  console.log('Contact opted out:', contactId);
}

/**
 * Handle contact opt-in (re-subscribe)
 */
async function handleOptIn(contactId: string): Promise<void> {
  const admin = getSupabaseAdminClient();

  await admin
    .from('contacts')
    .update({
      sms_opted_in: true,
      opted_out_at: null,
      status: 'active',
    })
    .eq('id', contactId);

  console.log('Contact opted in:', contactId);
}

/**
 * Handle enrollment response
 */
async function handleEnrollmentResponse(contactId: string, intent: string): Promise<void> {
  const admin = getSupabaseAdminClient();

  // Find active enrollments for this contact
  const { data: enrollments } = await admin
    .from('workflow_enrollments')
    .select('*, workflows(*)')
    .eq('contact_id', contactId)
    .eq('status', 'active');

  if (!enrollments || enrollments.length === 0) {
    return;
  }

  for (const enrollment of enrollments) {
    const workflow = enrollment.workflows as unknown as Workflow;
    const settings = workflow.settings as any;

    // Check if workflow should stop on response
    if (settings?.stop_on_response) {
      await admin
        .from('workflow_enrollments')
        .update({
          status: 'completed',
          responded_at: new Date().toISOString(),
          exit_reason: 'responded',
          exited_at: new Date().toISOString(),
        })
        .eq('id', enrollment.id);

      console.log('Enrollment completed due to response:', enrollment.id);
    } else {
      // Just mark that they responded
      await admin
        .from('workflow_enrollments')
        .update({ responded_at: new Date().toISOString() })
        .eq('id', enrollment.id);
    }

    // If positive response, could trigger conversion tracking
    if (intent === 'positive') {
      console.log('Positive response detected for enrollment:', enrollment.id);
    }
  }
}

// ============================================
// DELIVERY STATUS UPDATES
// ============================================

export interface DeliveryStatusParams {
  providerMessageId: string;
  status: 'delivered' | 'sent' | 'failed' | 'undelivered';
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Update message delivery status from webhook
 */
export async function updateDeliveryStatus(params: DeliveryStatusParams): Promise<void> {
  const admin = getSupabaseAdminClient();

  const statusMap: Record<string, string> = {
    delivered: 'delivered',
    sent: 'sent',
    failed: 'failed',
    undelivered: 'undelivered',
  };

  const updates: Record<string, any> = {
    status: statusMap[params.status] || params.status,
    provider_status: params.status,
  };

  if (params.status === 'delivered') {
    updates.delivered_at = new Date().toISOString();
  } else if (params.status === 'failed' || params.status === 'undelivered') {
    updates.failed_at = new Date().toISOString();
    updates.provider_error = params.errorMessage || params.errorCode;
  }

  await admin
    .from('messages')
    .update(updates)
    .eq('provider_message_id', params.providerMessageId);
}

// ============================================
// LEGACY CLASS-BASED SERVICE (for backward compatibility)
// ============================================

export interface SendSmsOptions {
  businessId: string;
  contactId?: string;
  to: string;
  message: string;
  workflowId?: string;
  enrollmentId?: string;
  fromNumber?: string;
}

export interface InitiateCallOptions {
  businessId: string;
  contactId?: string;
  to: string;
  script: string;
  voiceId?: string;
  workflowId?: string;
  enrollmentId?: string;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  callId?: string;
  creditsUsed: number;
  error?: string;
}

class MessagingService {
  /**
   * Send an SMS message
   */
  async sendSms(options: SendSmsOptions): Promise<MessageResult> {
    const supabase = createAdminClient();

    try {
      // Check if contact has opted out
      if (options.contactId) {
        const contact = await contactsService.getById(options.contactId, options.businessId);
        if (contact?.status === 'opted_out' || contact?.status === 'unsubscribed') {
          return {
            success: false,
            creditsUsed: 0,
            error: 'Contact has opted out of messages',
          };
        }
      }

      // Check credit balance
      const creditsNeeded = CREDIT_COSTS.sms;
      const hasCredits = await creditsService.checkBalance(options.businessId, creditsNeeded);
      if (!hasCredits) {
        return {
          success: false,
          creditsUsed: 0,
          error: 'Insufficient credits',
        };
      }

      // Replace template variables
      const processedMessage = await this.processTemplate(
        options.message,
        options.businessId,
        options.contactId
      );

      // Send SMS via Telnyx
      const result = await telnyxSendSms({
        to: options.to,
        from: options.fromNumber,
        text: processedMessage,
      });

      if (!result.success) {
        return {
          success: false,
          creditsUsed: 0,
          error: result.error,
        };
      }

      // Deduct credits
      await creditsService.deductCredits(options.businessId, creditsNeeded, {
        type: 'sms',
        messageId: result.messageId,
        contactId: options.contactId,
        workflowId: options.workflowId,
      });

      // Log message
      await this.logMessage({
        businessId: options.businessId,
        contactId: options.contactId,
        type: 'sms',
        direction: 'outbound',
        content: processedMessage,
        status: 'sent',
        externalId: result.messageId,
        workflowId: options.workflowId,
        enrollmentId: options.enrollmentId,
      });

      // Update contact last contacted
      if (options.contactId) {
        await contactsService.markContacted(options.contactId, options.businessId);
      }

      return {
        success: true,
        messageId: result.messageId,
        creditsUsed: creditsNeeded,
      };
    } catch (error) {
      console.error('SMS send error:', error);
      return {
        success: false,
        creditsUsed: 0,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      };
    }
  }

  /**
   * Initiate a voice call
   */
  async initiateCall(options: InitiateCallOptions): Promise<MessageResult> {
    try {
      // Check if contact has opted out
      if (options.contactId) {
        const contact = await contactsService.getById(options.contactId, options.businessId);
        if (contact?.status === 'opted_out' || contact?.status === 'unsubscribed') {
          return {
            success: false,
            creditsUsed: 0,
            error: 'Contact has opted out of calls',
          };
        }
      }

      // Estimate credits needed (minimum 1 minute)
      const estimatedMinutes = 1;
      const creditsNeeded = CREDIT_COSTS.voice_per_minute * estimatedMinutes;
      const hasCredits = await creditsService.checkBalance(options.businessId, creditsNeeded);
      if (!hasCredits) {
        return {
          success: false,
          creditsUsed: 0,
          error: 'Insufficient credits',
        };
      }

      // Process script template
      const processedScript = await this.processTemplate(
        options.script,
        options.businessId,
        options.contactId
      );

      // Generate voice audio using ElevenLabs
      const audioBuffer = await textToSpeech({
        text: processedScript,
        voiceId: options.voiceId,
      });

      // TODO: Initiate call via Telnyx with the audio
      const callId = `call_${Date.now()}`;

      // Reserve credits (actual deduction happens after call completes)
      await creditsService.reserveCredits(options.businessId, creditsNeeded, {
        type: 'voice',
        callId,
        contactId: options.contactId,
        workflowId: options.workflowId,
      });

      // Log call initiation
      await this.logMessage({
        businessId: options.businessId,
        contactId: options.contactId,
        type: 'voice',
        direction: 'outbound',
        content: processedScript,
        status: 'initiated',
        externalId: callId,
        workflowId: options.workflowId,
        enrollmentId: options.enrollmentId,
      });

      return {
        success: true,
        callId,
        creditsUsed: creditsNeeded,
      };
    } catch (error) {
      console.error('Voice call error:', error);
      return {
        success: false,
        creditsUsed: 0,
        error: error instanceof Error ? error.message : 'Failed to initiate call',
      };
    }
  }

  /**
   * Process message template with variable replacement
   */
  private async processTemplate(
    template: string,
    businessId: string,
    contactId?: string
  ): Promise<string> {
    const supabase = createAdminClient();
    let processed = template;

    // Get business info
    const { data: business } = await supabase
      .from('businesses')
      .select('name, phone, email')
      .eq('id', businessId)
      .single();

    if (business) {
      processed = processed.replace(/\{\{business_name\}\}/g, business.name || '');
      processed = processed.replace(/\{\{business_phone\}\}/g, business.phone || '');
      processed = processed.replace(/\{\{business_email\}\}/g, business.email || '');
    }

    // Get contact info if provided
    if (contactId) {
      const contact = await contactsService.getById(contactId, businessId);
      if (contact) {
        processed = processed.replace(/\{\{first_name\}\}/g, contact.first_name || '');
        processed = processed.replace(/\{\{last_name\}\}/g, contact.last_name || '');
        processed = processed.replace(/\{\{phone\}\}/g, contact.phone || '');
        processed = processed.replace(/\{\{email\}\}/g, contact.email || '');
      }
    }

    return processed;
  }

  /**
   * Log a message to the database
   */
  private async logMessage(data: {
    businessId: string;
    contactId?: string;
    type: 'sms' | 'voice';
    direction: 'inbound' | 'outbound';
    content: string;
    status: string;
    externalId?: string;
    workflowId?: string;
    enrollmentId?: string;
  }): Promise<void> {
    const supabase = createAdminClient();

    await supabase.from('message_logs').insert({
      business_id: data.businessId,
      contact_id: data.contactId,
      type: data.type,
      direction: data.direction,
      content: data.content,
      status: data.status,
      external_id: data.externalId,
      workflow_id: data.workflowId,
      enrollment_id: data.enrollmentId,
      created_at: new Date().toISOString(),
    });
  }
}

export const messagingService = new MessagingService();
