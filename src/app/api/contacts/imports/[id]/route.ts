// @ts-nocheck
// ============================================
// SINGLE IMPORT JOB API
// Get import status
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getImportStatus } from '@/services/contact-import.service';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const importJob = await getImportStatus(params.id);

    if (!importJob) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    // Verify ownership
    if (importJob.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ import: importJob });
  } catch (error) {
    console.error('Get import error:', error);
    return NextResponse.json({ error: 'Failed to get import status' }, { status: 500 });
  }
}
