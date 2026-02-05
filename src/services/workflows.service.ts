// @ts-nocheck
// ============================================
// WORKFLOW SERVICE
// Workflow management and operations
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type {
  Workflow,
  WorkflowTemplate,
  WorkflowEnrollment,
  Contact,
  Organization,
  WorkflowInsert,
  WorkflowUpdate,
} from '@/types/database';
import type {
  WorkflowStep,
  WorkflowSettings,
  EnrollmentCriteria,
} from '@/types/workflows';

// Legacy import for backward compatibility
const createAdminClient = getSupabaseAdminClient;

// ============================================
// DEFAULT SETTINGS
// ============================================

const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  send_window_start: '09:00',
  send_window_end: '20:00',
  send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  respect_timezone: true,
  stop_on_response: true,
  stop_on_booking: true,
};

const DEFAULT_ENROLLMENT_CRITERIA: EnrollmentCriteria = {
  status: ['active'],
  tags_exclude: ['do_not_contact', 'vip'],
};

// ============================================
// WORKFLOW CRUD
// ============================================

/**
 * Create a new workflow from template
 */
export async function createWorkflowFromTemplate(params: {
  organizationId: string;
  templateId: string;
  name?: string;
  settings?: Partial<WorkflowSettings>;
  enrollmentCriteria?: Partial<EnrollmentCriteria>;
}): Promise<Workflow> {
  const admin = getSupabaseAdminClient();

  // Get template
  const { data: template, error: templateError } = await admin
    .from('workflow_templates')
    .select('*')
    .eq('id', params.templateId)
    .single();

  if (templateError || !template) {
    throw new Error('Template not found');
  }

  // Create workflow
  const workflowInsert: WorkflowInsert = {
    organization_id: params.organizationId,
    template_id: params.templateId,
    name: params.name || template.name,
    description: template.description,
    category: template.category,
    status: 'draft',
    steps: template.steps as WorkflowStep[],
    settings: {
      ...DEFAULT_WORKFLOW_SETTINGS,
      ...(template.default_settings || {}),
      ...params.settings,
    } as any,
    enrollment_criteria: {
      ...DEFAULT_ENROLLMENT_CRITERIA,
      ...params.enrollmentCriteria,
    } as any,
  };

  const { data: workflow, error: workflowError } = await admin
    .from('workflows')
    .insert(workflowInsert)
    .select()
    .single();

  if (workflowError || !workflow) {
    throw new Error('Failed to create workflow');
  }

  // Increment template usage
  await admin
    .from('workflow_templates')
    .update({ times_used: template.times_used + 1 })
    .eq('id', params.templateId);

  return workflow;
}

/**
 * Create a custom workflow
 */
export async function createCustomWorkflow(params: {
  organizationId: string;
  name: string;
  description?: string;
  category: string;
  steps: WorkflowStep[];
  settings?: Partial<WorkflowSettings>;
  enrollmentCriteria?: Partial<EnrollmentCriteria>;
}): Promise<Workflow> {
  const admin = getSupabaseAdminClient();

  const workflowInsert: WorkflowInsert = {
    organization_id: params.organizationId,
    template_id: null,
    name: params.name,
    description: params.description || null,
    category: params.category as any,
    status: 'draft',
    steps: params.steps,
    settings: {
      ...DEFAULT_WORKFLOW_SETTINGS,
      ...params.settings,
    } as any,
    enrollment_criteria: {
      ...DEFAULT_ENROLLMENT_CRITERIA,
      ...params.enrollmentCriteria,
    } as any,
  };

  const { data: workflow, error } = await admin
    .from('workflows')
    .insert(workflowInsert)
    .select()
    .single();

  if (error || !workflow) {
    throw new Error('Failed to create workflow');
  }

  return workflow;
}

/**
 * Update workflow
 */
export async function updateWorkflow(
  workflowId: string,
  updates: WorkflowUpdate
): Promise<Workflow> {
  const admin = getSupabaseAdminClient();

  const { data: workflow, error } = await admin
    .from('workflows')
    .update(updates)
    .eq('id', workflowId)
    .select()
    .single();

  if (error || !workflow) {
    throw new Error('Failed to update workflow');
  }

  return workflow;
}

/**
 * Activate a workflow
 */
export async function activateWorkflow(workflowId: string): Promise<Workflow> {
  const admin = getSupabaseAdminClient();

  // Validate workflow has steps
  const { data: workflow } = await admin
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const steps = workflow.steps as WorkflowStep[];
  if (!steps || steps.length === 0) {
    throw new Error('Workflow must have at least one step');
  }

  const { data: updated, error } = await admin
    .from('workflows')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
      paused_at: null,
    })
    .eq('id', workflowId)
    .select()
    .single();

  if (error || !updated) {
    throw new Error('Failed to activate workflow');
  }

  return updated;
}

/**
 * Pause a workflow
 */
export async function pauseWorkflow(workflowId: string): Promise<Workflow> {
  const admin = getSupabaseAdminClient();

  const { data: workflow, error } = await admin
    .from('workflows')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
    })
    .eq('id', workflowId)
    .select()
    .single();

  if (error || !workflow) {
    throw new Error('Failed to pause workflow');
  }

  // Pause all active enrollments
  await admin
    .from('workflow_enrollments')
    .update({ status: 'paused' })
    .eq('workflow_id', workflowId)
    .eq('status', 'active');

  return workflow;
}

/**
 * Resume a paused workflow
 */
export async function resumeWorkflow(workflowId: string): Promise<Workflow> {
  const admin = getSupabaseAdminClient();

  const { data: workflow, error } = await admin
    .from('workflows')
    .update({
      status: 'active',
      paused_at: null,
    })
    .eq('id', workflowId)
    .select()
    .single();

  if (error || !workflow) {
    throw new Error('Failed to resume workflow');
  }

  // Resume paused enrollments
  await admin
    .from('workflow_enrollments')
    .update({ status: 'active' })
    .eq('workflow_id', workflowId)
    .eq('status', 'paused');

  return workflow;
}

/**
 * Archive a workflow
 */
export async function archiveWorkflow(workflowId: string): Promise<Workflow> {
  const admin = getSupabaseAdminClient();

  // Exit all active enrollments
  await admin
    .from('workflow_enrollments')
    .update({
      status: 'completed',
      exit_reason: 'workflow_archived',
      exited_at: new Date().toISOString(),
    })
    .eq('workflow_id', workflowId)
    .in('status', ['active', 'pending', 'paused']);

  const { data: workflow, error } = await admin
    .from('workflows')
    .update({
      status: 'archived',
      deleted_at: new Date().toISOString(),
    })
    .eq('id', workflowId)
    .select()
    .single();

  if (error || !workflow) {
    throw new Error('Failed to archive workflow');
  }

  return workflow;
}

/**
 * Get workflow with stats
 */
export async function getWorkflowWithStats(
  workflowId: string
): Promise<
  Workflow & {
    stats: {
      active_enrollments: number;
      pending_enrollments: number;
      completed_enrollments: number;
    };
  }
> {
  const admin = getSupabaseAdminClient();

  const { data: workflow, error } = await admin
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (error || !workflow) {
    throw new Error('Workflow not found');
  }

  // Get enrollment counts
  const { data: enrollments } = await admin
    .from('workflow_enrollments')
    .select('status')
    .eq('workflow_id', workflowId);

  const stats = {
    active_enrollments: 0,
    pending_enrollments: 0,
    completed_enrollments: 0,
  };

  if (enrollments) {
    for (const enrollment of enrollments) {
      if (enrollment.status === 'active') stats.active_enrollments++;
      else if (enrollment.status === 'pending') stats.pending_enrollments++;
      else if (enrollment.status === 'completed') stats.completed_enrollments++;
    }
  }

  return { ...workflow, stats };
}

// ============================================
// CONTACT ENROLLMENT
// ============================================

/**
 * Enroll a single contact in a workflow
 */
export async function enrollContact(params: {
  workflowId: string;
  contactId: string;
  organizationId: string;
}): Promise<WorkflowEnrollment> {
  const admin = getSupabaseAdminClient();

  // Check if already enrolled
  const { data: existing } = await admin
    .from('workflow_enrollments')
    .select('id, status')
    .eq('workflow_id', params.workflowId)
    .eq('contact_id', params.contactId)
    .single();

  if (existing) {
    if (existing.status === 'active' || existing.status === 'pending') {
      throw new Error('Contact is already enrolled in this workflow');
    }
  }

  // Get workflow to calculate first action time
  const { data: workflow } = await admin
    .from('workflows')
    .select('*')
    .eq('id', params.workflowId)
    .single();

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  if (workflow.status !== 'active') {
    throw new Error('Cannot enroll in inactive workflow');
  }

  // Calculate next action time based on first step
  const steps = workflow.steps as WorkflowStep[];
  const firstStep = steps[0];
  const nextActionAt = calculateNextActionTime(
    new Date(),
    firstStep,
    workflow.settings as WorkflowSettings
  );

  const { data: enrollment, error } = await admin
    .from('workflow_enrollments')
    .upsert({
      organization_id: params.organizationId,
      workflow_id: params.workflowId,
      contact_id: params.contactId,
      status: 'active',
      current_step_index: 0,
      next_action_at: nextActionAt.toISOString(),
      enrolled_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !enrollment) {
    throw new Error('Failed to enroll contact');
  }

  // Update workflow stats
  await admin
    .from('workflows')
    .update({ total_enrolled: workflow.total_enrolled + 1 })
    .eq('id', params.workflowId);

  return enrollment;
}

/**
 * Enroll multiple contacts in a workflow
 */
export async function enrollContacts(params: {
  workflowId: string;
  contactIds: string[];
  organizationId: string;
}): Promise<{ enrolled: number; skipped: number; errors: string[] }> {
  let enrolled = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const contactId of params.contactIds) {
    try {
      await enrollContact({
        workflowId: params.workflowId,
        contactId,
        organizationId: params.organizationId,
      });
      enrolled++;
    } catch (error) {
      if (error instanceof Error && error.message.includes('already enrolled')) {
        skipped++;
      } else {
        errors.push(
          `Contact ${contactId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  return { enrolled, skipped, errors };
}

/**
 * Enroll contacts matching criteria
 */
export async function enrollContactsByCriteria(params: {
  workflowId: string;
  organizationId: string;
  criteria?: EnrollmentCriteria;
  limit?: number;
}): Promise<{ enrolled: number; skipped: number }> {
  const admin = getSupabaseAdminClient();

  // Get workflow
  const { data: workflow } = await admin
    .from('workflows')
    .select('*')
    .eq('id', params.workflowId)
    .single();

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const criteria = params.criteria || (workflow.enrollment_criteria as EnrollmentCriteria);

  // Build query based on criteria
  let query = admin
    .from('contacts')
    .select('id')
    .eq('organization_id', params.organizationId)
    .is('deleted_at', null);

  // Status filter
  if (criteria.status && criteria.status.length > 0) {
    query = query.in('status', criteria.status);
  }

  // Tag filters
  if (criteria.tags_include && criteria.tags_include.length > 0) {
    query = query.overlaps('tags', criteria.tags_include);
  }

  if (criteria.tags_exclude && criteria.tags_exclude.length > 0) {
    query = query.not('tags', 'ov', `{${criteria.tags_exclude.join(',')}}`);
  }

  // Date filters
  if (criteria.last_contacted_before_days) {
    const date = new Date();
    date.setDate(date.getDate() - criteria.last_contacted_before_days);
    query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${date.toISOString()}`);
  }

  if (criteria.last_job_before_days) {
    const date = new Date();
    date.setDate(date.getDate() - criteria.last_job_before_days);
    query = query.or(`last_job_at.is.null,last_job_at.lt.${date.toISOString()}`);
  }

  // Phone/email requirements
  if (criteria.has_phone) {
    query = query.not('phone', 'is', null);
  }

  if (criteria.has_email) {
    query = query.not('email', 'is', null);
  }

  // Apply limit
  if (params.limit) {
    query = query.limit(params.limit);
  }

  const { data: contacts, error } = await query;

  if (error || !contacts) {
    throw new Error('Failed to fetch contacts');
  }

  // Enroll contacts
  return enrollContacts({
    workflowId: params.workflowId,
    contactIds: contacts.map((c) => c.id),
    organizationId: params.organizationId,
  });
}

/**
 * Remove contact from workflow
 */
export async function unenrollContact(params: {
  workflowId: string;
  contactId: string;
  reason?: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient();

  await admin
    .from('workflow_enrollments')
    .update({
      status: 'completed',
      exit_reason: params.reason || 'manual_removal',
      exited_at: new Date().toISOString(),
    })
    .eq('workflow_id', params.workflowId)
    .eq('contact_id', params.contactId)
    .in('status', ['active', 'pending', 'paused']);
}

// ============================================
// SCHEDULING HELPERS
// ============================================

/**
 * Calculate next action time based on step delay and settings
 */
export function calculateNextActionTime(
  fromDate: Date,
  step: WorkflowStep,
  settings: WorkflowSettings
): Date {
  const nextDate = new Date(fromDate);

  // Add step delay
  nextDate.setDate(nextDate.getDate() + (step.delay_days || 0));
  nextDate.setHours(nextDate.getHours() + (step.delay_hours || 0));

  // Adjust for send window
  const sendWindowStart = parseTime(settings.send_window_start || '09:00');
  const sendWindowEnd = parseTime(settings.send_window_end || '20:00');

  // If outside send window, move to next valid time
  const currentHour = nextDate.getHours();
  const currentMinute = nextDate.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startTime = sendWindowStart.hours * 60 + sendWindowStart.minutes;
  const endTime = sendWindowEnd.hours * 60 + sendWindowEnd.minutes;

  if (currentTime < startTime) {
    // Before window, set to start of window
    nextDate.setHours(sendWindowStart.hours, sendWindowStart.minutes, 0, 0);
  } else if (currentTime >= endTime) {
    // After window, set to start of window next day
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(sendWindowStart.hours, sendWindowStart.minutes, 0, 0);
  }

  // Adjust for send days
  const sendDays = settings.send_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const allowedDays = sendDays.map((d) => dayMap[d.toLowerCase()]);

  // Move to next allowed day if needed
  let attempts = 0;
  while (!allowedDays.includes(nextDate.getDay()) && attempts < 7) {
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(sendWindowStart.hours, sendWindowStart.minutes, 0, 0);
    attempts++;
  }

  return nextDate;
}

/**
 * Parse time string (HH:MM) to hours and minutes
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

/**
 * Check if current time is within send window
 */
export function isWithinSendWindow(date: Date, settings: WorkflowSettings): boolean {
  const sendWindowStart = parseTime(settings.send_window_start || '09:00');
  const sendWindowEnd = parseTime(settings.send_window_end || '20:00');

  const currentHour = date.getHours();
  const currentMinute = date.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startTime = sendWindowStart.hours * 60 + sendWindowStart.minutes;
  const endTime = sendWindowEnd.hours * 60 + sendWindowEnd.minutes;

  if (currentTime < startTime || currentTime >= endTime) {
    return false;
  }

  // Check day of week
  const sendDays = settings.send_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const dayMap: Record<number, string> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  };

  const currentDay = dayMap[date.getDay()];
  return sendDays.map((d) => d.toLowerCase()).includes(currentDay);
}

// ============================================
// LEGACY CLASS-BASED SERVICE
// ============================================

export interface WorkflowCreateInput {
  name: string;
  description?: string;
  steps: Omit<WorkflowStep, 'id' | 'workflow_id' | 'created_at'>[];
  settings?: WorkflowSettings;
}

class WorkflowsService {
  async list(businessId: string, status?: string): Promise<Workflow[]> {
    const supabase = createAdminClient();

    let query = supabase
      .from('workflows')
      .select('*')
      .eq('organization_id', businessId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  async getById(id: string, businessId: string): Promise<Workflow | null> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .eq('organization_id', businessId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  }

  async activate(id: string, businessId: string): Promise<void> {
    await activateWorkflow(id);
  }

  async pause(id: string, businessId: string): Promise<void> {
    await pauseWorkflow(id);
  }

  async delete(id: string, businessId: string): Promise<void> {
    await archiveWorkflow(id);
  }

  async enrollContact(workflowId: string, contactId: string): Promise<WorkflowEnrollment> {
    const supabase = createAdminClient();

    const { data: workflow } = await supabase
      .from('workflows')
      .select('organization_id')
      .eq('id', workflowId)
      .single();

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    return enrollContact({
      workflowId,
      contactId,
      organizationId: workflow.organization_id,
    });
  }

  async updateEnrollment(
    enrollmentId: string,
    updates: Partial<Pick<WorkflowEnrollment, 'status' | 'current_step_index' | 'next_action_at'>>
  ): Promise<void> {
    const supabase = createAdminClient();

    const updateData: Record<string, unknown> = { ...updates };

    if (updates.status === 'completed') {
      updateData.exited_at = new Date().toISOString();
      updateData.exit_reason = 'completed';
    } else if (updates.status === 'failed') {
      updateData.exited_at = new Date().toISOString();
      updateData.exit_reason = 'error';
    }

    const { error } = await supabase
      .from('workflow_enrollments')
      .update(updateData)
      .eq('id', enrollmentId);

    if (error) throw error;
  }

  async getPendingEnrollments(limit: number = 100): Promise<WorkflowEnrollment[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('workflow_enrollments')
      .select('*, workflows(*), contacts(*)')
      .eq('status', 'active')
      .lte('next_action_at', new Date().toISOString())
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  async pauseAllForBusiness(businessId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('workflows')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('organization_id', businessId)
      .eq('status', 'active');

    if (error) throw error;
  }
}

export const workflowsService = new WorkflowsService();
