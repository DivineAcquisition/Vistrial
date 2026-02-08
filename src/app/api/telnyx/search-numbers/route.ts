// ============================================
// SEARCH AVAILABLE PHONE NUMBERS VIA TELNYX
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const areaCode = searchParams.get('areaCode');

    if (!areaCode) {
      return NextResponse.json({ error: 'Area code required' }, { status: 400 });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        numbers: [
          { phone_number: `+1${areaCode}5550001`, locality: 'Local', region: areaCode },
          { phone_number: `+1${areaCode}5550002`, locality: 'Local', region: areaCode },
          { phone_number: `+1${areaCode}5550003`, locality: 'Local', region: areaCode },
        ],
        note: 'Demo numbers - configure TELNYX_API_KEY for real numbers',
      });
    }

    const response = await fetch(
      `https://api.telnyx.com/v2/available_phone_numbers?filter[national_destination_code]=${areaCode}&filter[country_code]=US&filter[features][]=sms&filter[limit]=10`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Telnyx search error:', await response.text());
      return NextResponse.json({ error: 'Failed to search numbers' }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json({ numbers: data.data || [] });
  } catch (error) {
    console.error('Search numbers error:', error);
    return NextResponse.json({ error: 'Failed to search numbers' }, { status: 500 });
  }
}
