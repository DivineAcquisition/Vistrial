/**
 * Workflows Service
 * 
 * Business logic for workflow management:
 * - CRUD operations for workflows
 * - Enrollment management
 * - Step execution
 * - Status management
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { 
  Workflow, 
  WorkflowStep, 
  WorkflowSettings, 
  WorkflowEnrollment,
  WorkflowStatus,
  EnrollmentStatus 
} from "@/types/workflows";

export interface WorkflowCreateInput {
  name: string;
  description?: string;
  steps: Omit<WorkflowStep, "id" | "workflow_id" | "created_at">[];
  settings?: WorkflowSettings;
}

class WorkflowsService {
  /**
   * List all workflows for a business
   */
  async list(businessId: string, status?: WorkflowStatus): Promise<Workflow[]> {
    const supabase = createAdminClient();

    let query = supabase
      .from("workflows")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a workflow by ID
   */
  async getById(id: string, businessId: string): Promise<Workflow | null> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("workflows")
      .select("*, workflow_steps(*)")
      .eq("id", id)
      .eq("business_id", businessId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return data;
  }

  /**
   * Create a new workflow
   */
  async create(businessId: string, input: WorkflowCreateInput): Promise<Workflow> {
    const supabase = createAdminClient();

    // Create workflow
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .insert({
        business_id: businessId,
        name: input.name,
        description: input.description,
        status: "draft",
        settings: input.settings || {},
      })
      .select()
      .single();

    if (workflowError) throw workflowError;

    // Create steps
    if (input.steps.length > 0) {
      const steps = input.steps.map((step) => ({
        ...step,
        workflow_id: workflow.id,
      }));

      const { error: stepsError } = await supabase
        .from("workflow_steps")
        .insert(steps);

      if (stepsError) throw stepsError;
    }

    return workflow;
  }

  /**
   * Update a workflow
   */
  async update(
    id: string,
    businessId: string,
    updates: Partial<WorkflowCreateInput>
  ): Promise<Workflow> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("workflows")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Activate a workflow
   */
  async activate(id: string, businessId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("workflows")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId);

    if (error) throw error;
  }

  /**
   * Pause a workflow
   */
  async pause(id: string, businessId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("workflows")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId);

    if (error) throw error;
  }

  /**
   * Delete a workflow
   */
  async delete(id: string, businessId: string): Promise<void> {
    const supabase = createAdminClient();

    // Delete steps first
    await supabase
      .from("workflow_steps")
      .delete()
      .eq("workflow_id", id);

    // Delete enrollments
    await supabase
      .from("workflow_enrollments")
      .delete()
      .eq("workflow_id", id);

    // Delete workflow
    const { error } = await supabase
      .from("workflows")
      .delete()
      .eq("id", id)
      .eq("business_id", businessId);

    if (error) throw error;
  }

  /**
   * Enroll a contact in a workflow
   */
  async enrollContact(workflowId: string, contactId: string): Promise<WorkflowEnrollment> {
    const supabase = createAdminClient();

    // Check if already enrolled
    const { data: existing } = await supabase
      .from("workflow_enrollments")
      .select("*")
      .eq("workflow_id", workflowId)
      .eq("contact_id", contactId)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      throw new Error("Contact is already enrolled in this workflow");
    }

    // Get first step delay
    const { data: steps } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("order", { ascending: true })
      .limit(1);

    const firstStep = steps?.[0];
    let nextStepAt = new Date();

    // If first step is a delay, calculate next step time
    if (firstStep?.type === "delay" && firstStep.delay_value && firstStep.delay_unit) {
      const delayMs = this.getDelayMs(firstStep.delay_value, firstStep.delay_unit);
      nextStepAt = new Date(Date.now() + delayMs);
    }

    const { data, error } = await supabase
      .from("workflow_enrollments")
      .insert({
        workflow_id: workflowId,
        contact_id: contactId,
        status: "active",
        current_step: 1,
        next_step_at: nextStepAt.toISOString(),
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update enrollment status
   */
  async updateEnrollment(
    enrollmentId: string,
    updates: Partial<Pick<WorkflowEnrollment, "status" | "current_step_index" | "next_action_at">>
  ): Promise<void> {
    const supabase = createAdminClient();

    const updateData: Record<string, unknown> = { ...updates };
    
    if (updates.status === "completed") {
      updateData.exited_at = new Date().toISOString();
      updateData.exit_reason = "completed";
    } else if (updates.status === "failed") {
      updateData.exited_at = new Date().toISOString();
      updateData.exit_reason = "error";
    }

    const { error } = await supabase
      .from("workflow_enrollments")
      .update(updateData)
      .eq("id", enrollmentId);

    if (error) throw error;
  }

  /**
   * Get pending enrollments for processing
   */
  async getPendingEnrollments(limit: number = 100): Promise<WorkflowEnrollment[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("workflow_enrollments")
      .select("*, workflow:workflows(*), contact:contacts(*)")
      .eq("status", "active")
      .lte("next_step_at", new Date().toISOString())
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Pause all workflows for a business
   */
  async pauseAllForBusiness(businessId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("workflows")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("status", "active");

    if (error) throw error;
  }

  /**
   * Calculate delay in milliseconds
   */
  private getDelayMs(value: number, unit: string): number {
    switch (unit) {
      case "minutes":
        return value * 60 * 1000;
      case "hours":
        return value * 60 * 60 * 1000;
      case "days":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  }
}

export const workflowsService = new WorkflowsService();
