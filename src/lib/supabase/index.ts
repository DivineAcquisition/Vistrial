// ============================================
// SUPABASE EXPORTS
// ============================================

// Browser client (for Client Components)
export { getSupabaseBrowserClient, supabase, createClient } from './client';

// Server client (for Server Components, Route Handlers, Server Actions)
export {
  getSupabaseServerClient,
  createServerSupabaseClient,
  getServerUser,
  getServerSession,
  requireAuth,
  getUserOrganization,
  getAuthenticatedContext,
} from './server';

// Admin client (for webhooks, cron jobs - bypasses RLS)
export {
  getSupabaseAdminClient,
  createAdminClient,
  getOrganizationByStripeCustomerId,
  getOrganizationByStripeSubscriptionId,
  updateOrganizationSubscription,
  getCreditBalance,
  addCreditsAdmin,
  deductCreditsAdmin,
  createTransaction,
  getOrganizationsNeedingRefill,
  getContactByPhone,
  getPendingMessages,
  updateMessageQueueItem,
  updateEnrollmentNextAction,
  getEnrollmentsToProcess,
  createMessage,
  updateMessageStatus,
  getMessageByProviderId,
} from './admin';
