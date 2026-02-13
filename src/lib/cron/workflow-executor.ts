// ============================================
// WORKFLOW EXECUTOR
// Processes scheduled workflow steps
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendMessage } from '@/lib/services/message-service';
import { personalizeTemplate } from '@/lib/utils/template-personalization';

interface ExecutionResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{ stepId: string; error: string }>;
}

/**
 * Execute all pending scheduled steps
 */
export async function executeScheduledSteps(): Promise<ExecutionResult> {
  const admin = getSupabaseAdminClient();
  const result: ExecutionResult = { processed: 0, successful: 0, failed: 0, errors: [] };

  try {
    const { data: pendingSteps, error: fetchError } = await admin
      .from('scheduled_steps')
      .select('id, enrollment_id, step_index, scheduled_for, status')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error('Failed to fetch pending steps:', fetchError);
      return result;
    }

    if (!pendingSteps || pendingSteps.length === 0) {
      return result;
    }

    console.log(`Processing ${pendingSteps.length} scheduled steps`);

    for (const step of pendingSteps) {
      result.processed++;

      try {
        // Mark as processing (lock)
        await admin.from('scheduled_steps').update({ status: 'processing' }).eq('id', step.id).eq('status', 'pending');

        // Get enrollment with workflow and contact
        const { data: enrollment, error: enrollmentError } = await admin
          .from('workflow_enrollments')
          .select('id, status, workflow_id, contact_id, organization_id, workflows (id, name, steps, status), contacts (id, first_name, last_name, phone, email, status)')
          .eq('id', step.enrollment_id)
          .single();

        if (enrollmentError || !enrollment) {
          throw new Error('Enrollment not found');
        }

        if (enrollment.status !== 'active') {
          await admin.from('scheduled_steps').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: `Enrollment status: ${enrollment.status}` }).eq('id', step.id);
          continue;
        }

        const workflow = enrollment.workflows as any;
        if (!workflow || workflow.status !== 'active') {
          await admin.from('scheduled_steps').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'Workflow not active' }).eq('id', step.id);
          continue;
        }

        const contact = enrollment.contacts as any;
        if (!contact || contact.status === 'unsubscribed') {
          await admin.from('scheduled_steps').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'Contact unsubscribed or invalid' }).eq('id', step.id);
          continue;
        }

        const steps = workflow.steps as any[];
        const stepConfig = steps[step.step_index];
        if (!stepConfig) throw new Error(`Step ${step.step_index} not found in workflow`);

        // Execute the step
        await executeStep(stepConfig, enrollment, contact, workflow, admin);

        await admin.from('scheduled_steps').update({ status: 'executed', executed_at: new Date().toISOString() }).eq('id', step.id);

        // Schedule next step if exists
        const nextStepIndex = step.step_index + 1;
        if (nextStepIndex < steps.length) {
          await scheduleNextStep(enrollment.id, nextStepIndex, steps[nextStepIndex], admin);
        } else {
          await admin.from('workflow_enrollments').update({ status: 'completed', outcome: 'completed', completed_at: new Date().toISOString(), completion_reason: 'all_steps_completed' }).eq('id', enrollment.id);
        }

        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({ stepId: step.id, error: error instanceof Error ? error.message : 'Unknown error' });
        await admin.from('scheduled_steps').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Unknown error' }).eq('id', step.id);
        console.error(`Failed to execute step ${step.id}:`, error);
      }
    }
  } catch (error) {
    console.error('executeScheduledSteps error:', error);
  }

  return result;
}

/**
 * Execute a single workflow step
 */
async function executeStep(stepConfig: any, enrollment: any, contact: any, workflow: any, admin: any) {
  const { data: organization } = await admin
    .from('organizations')
    .select('name, phone, email, website')
    .eq('id', enrollment.organization_id)
    .single();

  switch (stepConfig.type) {
    case 'sms': {
      const personalizedSMS = personalizeTemplate(stepConfig.content || stepConfig.message || '', {
        contact,
        organization: organization || {},
      });

      const smsResult = await sendMessage({
        organizationId: enrollment.organization_id,
        contactId: contact.id,
        type: 'sms',
        content: personalizedSMS,
        workflowId: workflow.id,
        enrollmentId: enrollment.id,
      });

      if (!smsResult.success) throw new Error(smsResult.error || 'Failed to send SMS');
      break;
    }

    case 'email': {
      const personalizedEmail = personalizeTemplate(stepConfig.content || stepConfig.body || '', {
        contact,
        organization: organization || {},
      });

      const personalizedSubject = personalizeTemplate(stepConfig.subject || 'Message', {
        contact,
        organization: organization || {},
      });

      const emailResult = await sendMessage({
        organizationId: enrollment.organization_id,
        contactId: contact.id,
        type: 'email',
        content: personalizedEmail,
        subject: personalizedSubject,
        workflowId: workflow.id,
        enrollmentId: enrollment.id,
      });

      if (!emailResult.success) throw new Error(emailResult.error || 'Failed to send email');
      break;
    }

    case 'wait':
      // Wait steps handled by scheduled_for timestamp
      break;

    default:
      console.log(`Unknown step type: ${stepConfig.type}`);
  }
}

/**
 * Schedule the next step in the workflow
 */
async function scheduleNextStep(enrollmentId: string, stepIndex: number, stepConfig: any, admin: any) {
  let delayMs = 0;

  if (stepConfig.type === 'wait') {
    delayMs = parseDelay(stepConfig.delay || stepConfig.duration || '1h');
  } else if (stepConfig.delay) {
    delayMs = parseDelay(stepConfig.delay);
  }

  const scheduledFor = new Date(Date.now() + delayMs);

  await admin.from('scheduled_steps').insert({
    enrollment_id: enrollmentId,
    step_index: stepIndex,
    scheduled_for: scheduledFor.toISOString(),
    status: 'pending',
  });
}

/**
 * Parse delay string to milliseconds
 */
function parseDelay(delay: string): number {
  const match = delay.match(/^(\d+)(m|h|d)$/i);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}
