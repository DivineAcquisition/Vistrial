// ============================================
// Stripe Connect for multi-tenant
// ============================================

import { stripe } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

// Create Stripe Connect account for business
export async function createConnectAccount(businessId: string, email: string) {
  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      business_id: businessId,
    },
  });

  // Save to database
  const supabase = createAdminClient();
  await supabase
    .from("businesses")
    .update({ stripe_account_id: account.id })
    .eq("id", businessId);

  return account;
}

// Generate onboarding link
export async function createAccountLink(
  accountId: string,
  _businessSlug: string
) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?refresh=true`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?success=true`,
    type: "account_onboarding",
  });

  return accountLink.url;
}

// Check if account is fully onboarded
export async function getAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);

  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: account.requirements,
  };
}

// Create login link for Express dashboard
export async function createDashboardLink(accountId: string) {
  const loginLink = await stripe.accounts.createLoginLink(accountId);
  return loginLink.url;
}
