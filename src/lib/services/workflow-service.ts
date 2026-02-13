// ============================================
// WORKFLOW SERVICE
// Handles workflow operations and enrollment
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export interface EnrollContactsParams {
  workflowId: string;
  organizationId: string;
  contactIds: string[];
  skipDuplicates?: boolean;
}

export interface EnrollmentResult {
  enrolled: number;
  skipped: number;
  errors: Array<{ contactId: string; reason: string }>;
}

/**
 * Enroll contacts into a workflow
 */
export async function enrollContacts(params: EnrollContactsParams): Promise<EnrollmentResult> {
  const { workflowId, organizationId, contactIds, skipDuplicates = true } = params;
  const admin = getSupabaseAdminClient();
  const result: EnrollmentResult = { enrolled: 0, skipped: 0, errors: [] };

  try {
    const { data: workflow, error: workflowError } = await admin
      .from('workflows')
      .select('id, status, steps')
      .eq('id', workflowId)
      .eq('organization_id', organizationId)
      .single();

    if (workflowError || !workflow) throw new Error('Workflow not found');
    if (workflow.status !== 'active') throw new Error('Workflow is not active');

    const steps = workflow.steps as any[];
    if (!steps || steps.length === 0) throw new Error('Workflow has no steps');

    // Get already enrolled contact IDs
    const { data: existingEnrollments } = await admin
      .from('workflow_enrollments')
      .select('contact_id')
      .eq('workflow_id', workflowId)
      .in('status', ['active', 'completed', 'responded']);

    const enrolledContactIds = new Set(existingEnrollments?.map((e: any) => e.contact_id) || []);

    // Get unsubscribed contacts
    const { data: contacts } = await admin
      .from('contacts')
      .select('id, status')
      .in('id', contactIds)
      .eq('organization_id', organizationId);

    const unsubscribedIds = new Set(
      contacts?.filter((c: any) => c.status === 'unsubscribed').map((c: any) => c.id) || []
    );

    for (const contactId of contactIds) {
      if (skipDuplicates && enrolledContactIds.has(contactId)) {
        result.skipped++;
        result.errors.push({ contactId, reason: 'Already enrolled' });
        continue;
      }

      if (unsubscribedIds.has(contactId)) {
        result.skipped++;
        result.errors.push({ contactId, reason: 'Contact unsubscribed' });
        continue;
      }

      try {
        const { data: enrollment, error: enrollError } = await admin
          .from('workflow_enrollments')
          .insert({
            workflow_id: workflowId,
            contact_id: contactId,
            organization_id: organizationId,
            status: 'active',
            current_step: 0,
            enrolled_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (enrollError || !enrollment) throw new Error('Failed to create enrollment');

        // Schedule first step
        const firstStep = steps[0];
        let scheduledFor = new Date();

        if (firstStep.delay) {
          const delayMs = parseDelay(firstStep.delay);
          scheduledFor = new Date(Date.now() + delayMs);
        }

        await admin.from('scheduled_steps').insert({
          enrollment_id: enrollment.id,
          step_index: 0,
          scheduled_for: scheduledFor.toISOString(),
          status: 'pending',
        });

        result.enrolled++;
      } catch (error) {
        result.errors.push({
          contactId,
          reason: error instanceof Error ? error.message : 'Enrollment failed',
        });
      }
    }
  } catch (error) {
    console.error('enrollContacts error:', error);
    throw error;
  }

  return result;
}

/**
 * Stop an enrollment
 */
export async function stopEnrollment(enrollmentId: string, reason: string): Promise<void> {
  const admin = getSupabaseAdminClient();

  await admin
    .from('workflow_enrollments')
    .update({ status: 'stopped', stopped_at: new Date().toISOString(), stop_reason: reason })
    .eq('id', enrollmentId);

  await admin
    .from('scheduled_steps')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason })
    .eq('enrollment_id', enrollmentId)
    .eq('status', 'pending');
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
