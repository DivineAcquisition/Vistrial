import { NextRequest, NextResponse } from 'next/server'
import { createDashboardLink } from '@/lib/stripe/connect'

// ============================================
// GET - Generate Stripe Express Dashboard link
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const stripeAccountId = searchParams.get('accountId')

    if (!stripeAccountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      )
    }

    // Note: In production, you would:
    // 1. Authenticate the user
    // 2. Verify they have access to this account

    const url = await createDashboardLink(stripeAccountId)

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Dashboard link error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create dashboard link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
