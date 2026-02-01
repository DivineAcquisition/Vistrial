import { stripe } from './client'
import type {
  ConnectAccountStatus,
  CreateConnectAccountParams,
  CreateConnectAccountResult,
  StripeAccountStatus,
} from '@/data/payment-schema'

// ============================================
// CREATE CONNECT ACCOUNT
// Creates an Express account for a cleaning business
// ============================================

export async function createConnectAccount(
  data: CreateConnectAccountParams
): Promise<CreateConnectAccountResult> {
  // Note: In production, you would check the database here first
  // to see if an account already exists

  // Create Express account
  const account = await stripe.accounts.create({
    type: 'express',
    country: data.country || 'US',
    email: data.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'company',
    business_profile: {
      name: data.businessName,
      mcc: '7349', // Cleaning services MCC code
      url: `https://vistrial.io/${data.businessId}`,
    },
    metadata: {
      business_id: data.businessId,
      platform: 'vistrial',
    },
  })

  return { accountId: account.id, alreadyExists: false }
}

// ============================================
// CREATE ONBOARDING LINK
// Generates a link for the business to complete Stripe onboarding
// ============================================

export async function createOnboardingLink(
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
    collection_options: {
      fields: 'eventually_due',
    },
  })

  return accountLink.url
}

// ============================================
// GET ACCOUNT STATUS
// Retrieves the current status of a connected account
// ============================================

export async function getConnectAccountStatus(
  stripeAccountId: string
): Promise<ConnectAccountStatus> {
  const account = await stripe.accounts.retrieve(stripeAccountId)

  return {
    id: account.id,
    chargesEnabled: account.charges_enabled || false,
    payoutsEnabled: account.payouts_enabled || false,
    detailsSubmitted: account.details_submitted || false,
    requirements: {
      currentlyDue: account.requirements?.currently_due || [],
      eventuallyDue: account.requirements?.eventually_due || [],
      pastDue: account.requirements?.past_due || [],
      pendingVerification: account.requirements?.pending_verification || [],
      disabledReason: account.requirements?.disabled_reason || null,
    },
    capabilities: account.capabilities as Record<string, string> | null,
  }
}

// ============================================
// CREATE DASHBOARD LINK
// Generates a link to the Stripe Express Dashboard
// ============================================

export async function createDashboardLink(stripeAccountId: string): Promise<string> {
  const loginLink = await stripe.accounts.createLoginLink(stripeAccountId)
  return loginLink.url
}

// ============================================
// DETERMINE ACCOUNT STATUS
// Maps Stripe account state to our status enum
// ============================================

export function determineAccountStatus(
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
  disabledReason: string | null
): StripeAccountStatus {
  if (chargesEnabled && payoutsEnabled) {
    return 'active'
  }

  if (disabledReason) {
    return 'restricted'
  }

  return 'pending'
}

// ============================================
// SYNC CONNECT ACCOUNT STATUS
// Updates the database with the current Stripe account status
// Returns the status object for use in the response
// ============================================

export async function syncConnectAccountStatus(
  stripeAccountId: string
): Promise<{ accountStatus: StripeAccountStatus } & ConnectAccountStatus> {
  const status = await getConnectAccountStatus(stripeAccountId)

  const accountStatus = determineAccountStatus(
    status.chargesEnabled,
    status.payoutsEnabled,
    status.requirements.disabledReason
  )

  // Note: In production, you would update the database here:
  // await supabase
  //   .from('businesses')
  //   .update({
  //     stripe_account_status: accountStatus,
  //     stripe_charges_enabled: status.chargesEnabled,
  //     stripe_payouts_enabled: status.payoutsEnabled,
  //     stripe_details_submitted: status.detailsSubmitted,
  //     stripe_onboarding_completed: status.detailsSubmitted && status.chargesEnabled,
  //   })
  //   .eq('stripe_account_id', stripeAccountId)

  return { accountStatus, ...status }
}

// ============================================
// UPDATE ACCOUNT EXTERNAL ACCOUNT
// Updates the bank account or debit card for payouts
// ============================================

export async function updateExternalAccount(
  stripeAccountId: string,
  externalAccountToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.accounts.createExternalAccount(stripeAccountId, {
      external_account: externalAccountToken,
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update external account'
    return { success: false, error: message }
  }
}

// ============================================
// DELETE CONNECT ACCOUNT
// Deletes a connected account (use with caution)
// ============================================

export async function deleteConnectAccount(
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.accounts.del(stripeAccountId)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete account'
    return { success: false, error: message }
  }
}

// ============================================
// GET ACCOUNT BALANCE
// Retrieves the current balance of a connected account
// ============================================

export async function getAccountBalance(stripeAccountId: string): Promise<{
  available: { amount: number; currency: string }[]
  pending: { amount: number; currency: string }[]
}> {
  const balance = await stripe.balance.retrieve({
    stripeAccount: stripeAccountId,
  })

  return {
    available: balance.available.map((b) => ({
      amount: b.amount / 100,
      currency: b.currency,
    })),
    pending: balance.pending.map((b) => ({
      amount: b.amount / 100,
      currency: b.currency,
    })),
  }
}

// ============================================
// LIST PAYOUTS
// Lists recent payouts for a connected account
// ============================================

export async function listPayouts(
  stripeAccountId: string,
  limit: number = 10
): Promise<
  {
    id: string
    amount: number
    currency: string
    status: string
    arrivalDate: Date
    created: Date
  }[]
> {
  const payouts = await stripe.payouts.list(
    { limit },
    { stripeAccount: stripeAccountId }
  )

  return payouts.data.map((payout) => ({
    id: payout.id,
    amount: payout.amount / 100,
    currency: payout.currency,
    status: payout.status,
    arrivalDate: new Date(payout.arrival_date * 1000),
    created: new Date(payout.created * 1000),
  }))
}

// ============================================
// CREATE PAYOUT
// Creates a manual payout for a connected account
// ============================================

export async function createPayout(
  stripeAccountId: string,
  amount: number,
  currency: string = 'usd'
): Promise<{ success: boolean; payoutId?: string; error?: string }> {
  try {
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amount * 100),
        currency,
      },
      { stripeAccount: stripeAccountId }
    )

    return { success: true, payoutId: payout.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create payout'
    return { success: false, error: message }
  }
}
