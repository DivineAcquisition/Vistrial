// @ts-nocheck
// ============================================
// NEW WORKFLOW PAGE
// Workflow creation with template selection
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { WorkflowCreator } from '@/components/workflows/workflow-creator';

export const metadata: Metadata = {
  title: 'Create Workflow | Vistrial',
};

export const dynamic = 'force-dynamic';

export default async function NewWorkflowPage({
  searchParams,
}: {
  searchParams: { template?: string };
}) {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  const supabase = await getSupabaseServerClient();

  // Get templates
  const { data: templates } = await supabase
    .from('workflow_templates')
    .select('*')
    .eq('is_active', true)
    .order('times_used', { ascending: false, nullsFirst: false });

  // Get selected template if any
  let selectedTemplate = null;
  if (searchParams.template) {
    const { data } = await supabase
      .from('workflow_templates')
      .select('*')
      .eq('id', searchParams.template)
      .single();
    selectedTemplate = data;
  }

  return (
    <WorkflowCreator
      organizationId={context.organization.id}
      templates={templates || []}
      initialTemplate={selectedTemplate}
    />
  );
}
