import { NextRequest, NextResponse } from 'next/server'
import {
  createConnectAccount,
  createOnboardingLink,
  getConnectAccountStatus,
} from '@/lib/stripe/connect'

// ============================================
// POST - Start Stripe Connect onboarding
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, email, businessName, country } = body

    // Validate required fields
    if (!businessId || !email || !businessName) {
      return NextResponse.json(
        { error: 'Missing required fields: businessId, email, businessName' },
        { status: 400 }
      )
    }

    // Note: In production, you would:
    // 1. Authenticate the user
    // 2. Check if they own the business
    // 3. Check if an account already exists in the database

    // Create Connect account
    const { accountId, alreadyExists } = await createConnectAccount({
      businessId,
      email,
      businessName,
      country,
    })

    // Generate onboarding link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const returnUrl = `${appUrl}/settings/payments?success=true`
    const refreshUrl = `${appUrl}/settings/payments?refresh=true`

    const onboardingUrl = await createOnboardingLink(accountId, returnUrl, refreshUrl)

    return NextResponse.json({
      url: onboardingUrl,
      accountId,
      alreadyExists,
    })
  } catch (error) {
    console.error('Stripe Connect error:', error)
    const message = error instanceof Error ? error.message : 'Failed to start onboarding'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================
// GET - Check Connect account status
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const stripeAccountId = searchParams.get('accountId')

    if (!stripeAccountId) {
      return NextResponse.json(
        { connected: false, status: 'not_connected' }
      )
    }

    // Note: In production, you would authenticate the user first

    // Get current status from Stripe
    const status = await getConnectAccountStatus(stripeAccountId)

    return NextResponse.json({
      connected: true,
      ...status,
    })
  } catch (error) {
    console.error('Get Connect status error:', error)
    const message = error instanceof Error ? error.message : 'Failed to get status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
