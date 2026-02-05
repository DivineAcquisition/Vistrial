// @ts-nocheck
// ============================================
// SINGLE CONTACT API
// Get, update, delete contact
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import {
  getContactWithEnrollments,
  updateContact,
  deleteContact,
} from '@/services/contacts.service';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contact = await getContactWithEnrollments(params.id);

    // Verify ownership
    if (contact.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Get contact error:', error);
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const supabase = await getSupabaseServerClient();
    const { data: existing } = await supabase
      .from('contacts')
      .select('organization_id')
      .eq('id', params.id)
      .single();

    if (!existing || existing.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const contact = await updateContact(params.id, body);

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Update contact error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update contact' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const supabase = await getSupabaseServerClient();
    const { data: existing } = await supabase
      .from('contacts')
      .select('organization_id')
      .eq('id', params.id)
      .single();

    if (!existing || existing.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await deleteContact(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
}
