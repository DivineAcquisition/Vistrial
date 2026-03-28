// ============================================
// PERMISSION TIER SYSTEM (V2)
// Auto-execute vs approval-required vs alert-only
// FIX 4: Client-facing outreach ALWAYS requires approval
// ============================================

export type PermissionTier = 'auto_execute' | 'approval_required' | 'alert_only';

export function getPermissionTier(actionType: string, target: 'internal' | 'client_facing' = 'internal'): PermissionTier {
  // FIX 4: Anything reaching end clients ALWAYS requires approval
  if (target === 'client_facing') return 'approval_required';

  const autoExecuteActions = [
    'health_score_update', 'health_score_log', 'internal_slack_post', 'internal_discord_post',
    'internal_email_report', 'morning_brief_delivery', 'weekly_brief_delivery',
    'in_app_notification', 'workflow_step_internal', 'check_in', 'milestone_celebration',
    'onboarding_step', 'invoice_reminder',
  ];
  if (autoExecuteActions.includes(actionType)) return 'auto_execute';

  const approvalActions = [
    'client_check_in_email', 'client_check_in_sms', 'renewal_offer',
    'upsell_message', 're_engagement_outreach', 'client_status_change_churned',
    'renewal', 'retention_save', 'escalation', 'custom',
  ];
  if (approvalActions.includes(actionType)) return 'approval_required';

  return 'alert_only';
}

export function canAutoSend(tier: PermissionTier): boolean {
  return tier === 'auto_execute';
}

export function needsApproval(tier: PermissionTier): boolean {
  return tier === 'approval_required';
}

// Legacy compatibility
export function getPermissionTierByHealth(healthScore: number, actionType: string): 1 | 2 | 3 {
  if (healthScore < 40) return 3;
  if (healthScore < 70) return 2;
  const autoActions = ['check_in', 'milestone_celebration', 'onboarding_step', 'invoice_reminder'];
  return autoActions.includes(actionType) ? 1 : 2;
}
