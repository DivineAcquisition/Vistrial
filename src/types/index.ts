// ============================================
// TYPE EXPORTS
// ============================================

// Database types (primary source of truth)
export * from './database';

// Workflow types - only export non-conflicting types
export {
  TEMPLATE_VARIABLES,
  DEFAULT_WORKFLOW_SETTINGS,
  DEFAULT_ENROLLMENT_CRITERIA,
} from './workflows';

// Note: WorkflowStep from workflows.ts adds email-specific fields
// For email workflows, import directly from '@/types/workflows'
export type { WorkflowStep as EmailWorkflowStep } from './workflows';

// API types
export * from './api';
