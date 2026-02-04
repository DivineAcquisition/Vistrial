/**
 * Messaging Service
 * 
 * Business logic for SMS and voice messaging:
 * - Send SMS messages
 * - Initiate voice calls
 * - Template variable replacement
 * - Message logging
 */

import { sendSms, initiateCall } from "@/lib/telnyx/client";
import { textToSpeech } from "@/lib/elevenlabs/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactsService } from "./contacts.service";
import { creditsService } from "./credits.service";
import { CREDIT_COSTS } from "@/constants/plans";

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
        if (contact?.status === "opted_out" || contact?.status === "unsubscribed") {
          return {
            success: false,
            creditsUsed: 0,
            error: "Contact has opted out of messages",
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
          error: "Insufficient credits",
        };
      }

      // Replace template variables
      const processedMessage = await this.processTemplate(
        options.message,
        options.businessId,
        options.contactId
      );

      // Send SMS via Telnyx
      const result = await sendSms({
        to: options.to,
        from: options.fromNumber,
        text: processedMessage,
      });

      // Deduct credits
      await creditsService.deductCredits(options.businessId, creditsNeeded, {
        type: "sms",
        messageId: result.messageId,
        contactId: options.contactId,
        workflowId: options.workflowId,
      });

      // Log message
      await this.logMessage({
        businessId: options.businessId,
        contactId: options.contactId,
        type: "sms",
        direction: "outbound",
        content: processedMessage,
        status: "sent",
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
      console.error("SMS send error:", error);
      return {
        success: false,
        creditsUsed: 0,
        error: error instanceof Error ? error.message : "Failed to send SMS",
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
        if (contact?.status === "opted_out" || contact?.status === "unsubscribed") {
          return {
            success: false,
            creditsUsed: 0,
            error: "Contact has opted out of calls",
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
          error: "Insufficient credits",
        };
      }

      // Process script template
      const processedScript = await this.processTemplate(
        options.script,
        options.businessId,
        options.contactId
      );

      // Generate voice audio using ElevenLabs
      // Note: In production, you'd handle this differently for real-time calls
      const audioBuffer = await textToSpeech({
        text: processedScript,
        voiceId: options.voiceId,
      });

      // TODO: Initiate call via Telnyx with the audio
      // For now, we'll simulate the call
      const callId = `call_${Date.now()}`;

      // Reserve credits (actual deduction happens after call completes)
      await creditsService.reserveCredits(options.businessId, creditsNeeded, {
        type: "voice",
        callId,
        contactId: options.contactId,
        workflowId: options.workflowId,
      });

      // Log call initiation
      await this.logMessage({
        businessId: options.businessId,
        contactId: options.contactId,
        type: "voice",
        direction: "outbound",
        content: processedScript,
        status: "initiated",
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
      console.error("Voice call error:", error);
      return {
        success: false,
        creditsUsed: 0,
        error: error instanceof Error ? error.message : "Failed to initiate call",
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
      .from("businesses")
      .select("name, phone, email")
      .eq("id", businessId)
      .single();

    if (business) {
      processed = processed.replace(/\{\{business_name\}\}/g, business.name || "");
      processed = processed.replace(/\{\{business_phone\}\}/g, business.phone || "");
      processed = processed.replace(/\{\{business_email\}\}/g, business.email || "");
    }

    // Get contact info if provided
    if (contactId) {
      const contact = await contactsService.getById(contactId, businessId);
      if (contact) {
        processed = processed.replace(/\{\{first_name\}\}/g, contact.first_name || "");
        processed = processed.replace(/\{\{last_name\}\}/g, contact.last_name || "");
        processed = processed.replace(/\{\{phone\}\}/g, contact.phone || "");
        processed = processed.replace(/\{\{email\}\}/g, contact.email || "");
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
    type: "sms" | "voice";
    direction: "inbound" | "outbound";
    content: string;
    status: string;
    externalId?: string;
    workflowId?: string;
    enrollmentId?: string;
  }): Promise<void> {
    const supabase = createAdminClient();

    await supabase.from("message_logs").insert({
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
