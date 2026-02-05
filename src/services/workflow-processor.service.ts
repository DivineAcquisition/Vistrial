// @ts-nocheck
// ============================================
// WORKFLOW PROCESSOR SERVICE
// Processes workflow enrollments and executes steps
// ============================================

import { getSupabaseAdminClient, getEnrollmentsToProcess } from '@/lib/supabase/admin';
import { sendWorkflowStepMessage } from './messaging.service';
import { sendWorkflowVoiceDrop } from './voicedrop.service';
import { calculateNextActionTime, isWithinSendWindow } from './workflows.service';
import type {
  WorkflowEnrollment,
  Contact,
  Workflow,
  Organization,
} from '@/types/database';
import type { WorkflowStep, WorkflowSettings } from '@/types/workflows';

// ============================================
// ENROLLMENT PROCESSING
// ============================================

export interface ProcessingResult {
  enrollmentId: string;
  success: boolean;
  action: 'message_sent' | 'voice_sent' | 'skipped' | 'completed' | 'failed';
  error?: string;
  nextStepIndex?: number;
  nextActionAt?: string;
}

/**
 * Process a single enrollment - execute current step
 */
export async function processEnrollment(
  enrollment: WorkflowEnrollment & {
    contacts: Contact;
    workflows: Workflow & {
      organizations: Organization;
    };
  }
): Promise<ProcessingResult> {
  const admin = getSupabaseAdminClient();

  const contact = enrollment.contacts;
  const workflow = enrollment.workflows;
  const organization = workflow.organizations;
  const steps = workflow.steps as WorkflowStep[];
  const settings = workflow.settings as WorkflowSettings;

  const currentStepIndex = enrollment.current_step_index;
  const currentStep = steps[currentStepIndex];

  // Validate workflow is still active
  if (workflow.status !== 'active') {
    return {
      enrollmentId: enrollment.id,
      success: false,
      action: 'skipped',
      error: 'Workflow is not active',
    };
  }

  // Validate contact is still valid
  if (
    contact.status === 'unsubscribed' ||
    contact.status === 'do_not_contact' ||
    contact.status === 'invalid'
  ) {
    // Exit enrollment
    await admin
      .from('workflow_enrollments')
      .update({
        status: 'completed',
        exit_reason: `contact_${contact.status}`,
        exited_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id);

    return {
      enrollmentId: enrollment.id,
      success: true,
      action: 'completed',
      error: `Contact status: ${contact.status}`,
    };
  }

  // Check step conditions
  if (currentStep.conditions) {
    const conditionsMet = await checkStepConditions(
      currentStep.conditions,
      enrollment,
      contact
    );

    if (!conditionsMet) {
      // Skip to next step
      return await advanceToNextStep(enrollment, workflow, settings);
    }
  }

  // Execute step based on type
  let result: ProcessingResult;

  try {
    if (currentStep.type === 'sms') {
      const sendResult = await sendWorkflowStepMessage({
        enrollment,
        contact,
        organization,
        workflow,
        step: currentStep,
        stepIndex: currentStepIndex,
      });

      if (sendResult.success) {
        result = {
          enrollmentId: enrollment.id,
          success: true,
          action: 'message_sent',
        };
      } else {
        result = {
          enrollmentId: enrollment.id,
          success: false,
          action: 'failed',
          error: sendResult.error,
        };
      }
    } else if (currentStep.type === 'voice_drop') {
      const sendResult = await sendWorkflowVoiceDrop({
        enrollment,
        contact,
        organization,
        workflow,
        step: currentStep,
        stepIndex: currentStepIndex,
      });

      if (sendResult.success) {
        result = {
          enrollmentId: enrollment.id,
          success: true,
          action: 'voice_sent',
        };
      } else {
        result = {
          enrollmentId: enrollment.id,
          success: false,
          action: 'failed',
          error: sendResult.error,
        };
      }
    } else {
      result = {
        enrollmentId: enrollment.id,
        success: false,
        action: 'failed',
        error: `Unknown step type: ${currentStep.type}`,
      };
    }

    // If successful, advance to next step
    if (result.success) {
      const advanceResult = await advanceToNextStep(enrollment, workflow, settings);
      result.nextStepIndex = advanceResult.nextStepIndex;
      result.nextActionAt = advanceResult.nextActionAt;
    }

    return result;
  } catch (error) {
    console.error('Error processing enrollment:', error);

    return {
      enrollmentId: enrollment.id,
      success: false,
      action: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check step conditions
 */
async function checkStepConditions(
  conditions: WorkflowStep['conditions'],
  enrollment: WorkflowEnrollment,
  contact: Contact
): Promise<boolean> {
  if (!conditions) return true;

  // Check if previous step had no response
  if (conditions.previous_step_no_response) {
    if (enrollment.responded_at) {
      return false; // They responded, skip this step
    }
  }

  // Check contact has email
  if (conditions.contact_has_email && !contact.email) {
    return false;
  }

  // Check contact has phone
  if (conditions.contact_has_phone && !contact.phone) {
    return false;
  }

  // Check custom field
  if (conditions.custom_field_equals) {
    const customFields = contact.custom_fields as Record<string, any>;
    const fieldValue = customFields[conditions.custom_field_equals.field];
    if (fieldValue !== conditions.custom_field_equals.value) {
      return false;
    }
  }

  return true;
}

/**
 * Advance enrollment to next step or complete
 */
async function advanceToNextStep(
  enrollment: WorkflowEnrollment,
  workflow: Workflow,
  settings: WorkflowSettings
): Promise<{ nextStepIndex?: number; nextActionAt?: string }> {
  const admin = getSupabaseAdminClient();
  const steps = workflow.steps as WorkflowStep[];
  const nextStepIndex = enrollment.current_step_index + 1;

  if (nextStepIndex >= steps.length) {
    // Workflow completed
    await admin
      .from('workflow_enrollments')
      .update({
        status: 'completed',
        exit_reason: 'completed',
        exited_at: new Date().toISOString(),
        next_action_at: null,
      })
      .eq('id', enrollment.id);

    // Update workflow stats
    await admin
      .from('workflows')
      .update({ total_completed: workflow.total_completed + 1 })
      .eq('id', workflow.id);

    return {};
  }

  // Calculate next action time
  const nextStep = steps[nextStepIndex];
  const nextActionAt = calculateNextActionTime(new Date(), nextStep, settings);

  await admin
    .from('workflow_enrollments')
    .update({
      current_step_index: nextStepIndex,
      next_action_at: nextActionAt.toISOString(),
    })
    .eq('id', enrollment.id);

  return {
    nextStepIndex,
    nextActionAt: nextActionAt.toISOString(),
  };
}

// ============================================
// BATCH PROCESSING
// ============================================

export interface BatchProcessingResult {
  processed: number;
  successful: number;
  failed: number;
  completed: number;
  skipped: number;
  results: ProcessingResult[];
}

/**
 * Process all due enrollments
 */
export async function processWorkflows(limit: number = 100): Promise<BatchProcessingResult> {
  const enrollments = await getEnrollmentsToProcess(limit);

  const results: ProcessingResult[] = [];
  let successful = 0;
  let failed = 0;
  let completed = 0;
  let skipped = 0;

  for (const enrollment of enrollments) {
    // Type assertion since the query returns the joined data
    const typedEnrollment = enrollment as unknown as WorkflowEnrollment & {
      contacts: Contact;
      workflows: Workflow & {
        organizations: Organization;
      };
    };

    // Check if within send window
    const settings = typedEnrollment.workflows.settings as WorkflowSettings;
    if (!isWithinSendWindow(new Date(), settings)) {
      skipped++;
      results.push({
        enrollmentId: enrollment.id,
        success: false,
        action: 'skipped',
        error: 'Outside send window',
      });
      continue;
    }

    const result = await processEnrollment(typedEnrollment);
    results.push(result);

    if (result.success) {
      successful++;
      if (result.action === 'completed') {
        completed++;
      }
    } else if (result.action === 'skipped') {
      skipped++;
    } else {
      failed++;
    }

    // Small delay between processing to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    processed: enrollments.length,
    successful,
    failed,
    completed,
    skipped,
    results,
  };
}

/**
 * Process workflows for a specific organization
 */
export async function processOrganizationWorkflows(
  organizationId: string,
  limit: number = 50
): Promise<BatchProcessingResult> {
  const admin = getSupabaseAdminClient();

  const { data: enrollments } = await admin
    .from('workflow_enrollments')
    .select(
      `
      *,
      contacts (*),
      workflows (
        *,
        organizations (*)
      )
    `
    )
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .lte('next_action_at', new Date().toISOString())
    .order('next_action_at', { ascending: true })
    .limit(limit);

  if (!enrollments || enrollments.length === 0) {
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      completed: 0,
      skipped: 0,
      results: [],
    };
  }

  const results: ProcessingResult[] = [];
  let successful = 0;
  let failed = 0;
  let completed = 0;
  let skipped = 0;

  for (const enrollment of enrollments) {
    const typedEnrollment = enrollment as unknown as WorkflowEnrollment & {
      contacts: Contact;
      workflows: Workflow & {
        organizations: Organization;
      };
    };

    const settings = typedEnrollment.workflows.settings as WorkflowSettings;
    if (!isWithinSendWindow(new Date(), settings)) {
      skipped++;
      continue;
    }

    const result = await processEnrollment(typedEnrollment);
    results.push(result);

    if (result.success) {
      successful++;
      if (result.action === 'completed') {
        completed++;
      }
    } else if (result.action === 'skipped') {
      skipped++;
    } else {
      failed++;
    }
  }

  return {
    processed: enrollments.length,
    successful,
    failed,
    completed,
    skipped,
    results,
  };
}
