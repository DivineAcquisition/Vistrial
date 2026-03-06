// ============================================
// PHONE VALIDATION API ENDPOINT
// Validates phone numbers via Telnyx
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { lookupNumber, lookupNumbers, estimateLookupCost } from '@/lib/telnyx/number-lookup';

// Validate a single number
export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const result = await lookupNumber(phone);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    );
  }
}

// Validate multiple numbers (bulk)
export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { phoneNumbers, skipValidation = false } = body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
      return NextResponse.json(
        { error: 'phoneNumbers array required' },
        { status: 400 }
      );
    }

    if (phoneNumbers.length > 1000) {
      return NextResponse.json(
        { error: 'Maximum 1000 numbers per request' },
        { status: 400 }
      );
    }

    // Return cost estimate if skipValidation
    if (skipValidation) {
      return NextResponse.json({
        count: phoneNumbers.length,
        estimatedCost: estimateLookupCost(phoneNumbers.length),
        message: 'Validation skipped - numbers not verified',
      });
    }

    // Perform validation
    const result = await lookupNumbers(phoneNumbers);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Bulk validation error:', error);
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    );
  }
}
