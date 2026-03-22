// ============================================
// PERMISSION TIER SYSTEM
// Tier 1: Auto-send (healthy clients, routine actions)
// Tier 2: Suggest + wait for approval (watch/at-risk)
// Tier 3: Alert only (critical clients, owner must act)
// ============================================

export function getPermissionTier(healthScore: number, actionType: string): 1 | 2 | 3 {
  // Critical clients: alert only, never auto-send
  if (healthScore < 40) return 3;

  // At-risk clients: suggest and wait
  if (healthScore < 70) return 2;

  // Healthy clients: depends on action type
  const autoSendActions = ['check_in', 'milestone_celebration', 'onboarding_step', 'invoice_reminder'];
  if (autoSendActions.includes(actionType)) return 1;

  // Renewal conversations, retention saves, escalations always need approval
  const approvalRequired = ['renewal', 'retention_save', 'escalation', 'custom'];
  if (approvalRequired.includes(actionType)) return 2;

  return 1;
}

export function canAutoSend(tier: number): boolean {
  return tier === 1;
}

export function needsApproval(tier: number): boolean {
  return tier === 2;
}

export function alertOnly(tier: number): boolean {
  return tier === 3;
}
