// @ts-nocheck
// ============================================
// CONTACTS API
// List and create contacts
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { listContacts, createContact } from '@/services/contacts.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse filters
    const filters = {
      status: searchParams.get('status')?.split(',') as any,
      tags: searchParams.get('tags')?.split(','),
      source: searchParams.get('source') || undefined,
      search: searchParams.get('search') || undefined,
      has_email: searchParams.get('has_email') === 'true' ? true : undefined,
      has_phone: searchParams.get('has_phone') === 'true' ? true : undefined,
    };

    // Parse pagination
    const pagination = {
      page: parseInt(searchParams.get('page') || '1'),
      per_page: Math.min(parseInt(searchParams.get('per_page') || '50'), 100),
      sort_by: searchParams.get('sort_by') || 'created_at',
      sort_order: (searchParams.get('sort_order') || 'desc') as 'asc' | 'desc',
    };

    const result = await listContacts(context.organization.id, filters, pagination);

    return NextResponse.json(result);
  } catch (error) {
    console.error('List contacts error:', error);
    return NextResponse.json({ error: 'Failed to list contacts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const contact = await createContact(context.organization.id, body);

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Create contact error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create contact' },
      { status: 400 }
    );
  }
}
