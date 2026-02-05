// @ts-nocheck
// ============================================
// CSV PREVIEW API
// Parse CSV and return headers with auto-mapping
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { parseCsv, autoDetectColumnMapping } from '@/services/contact-import.service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read file content
    const content = await file.text();

    // Parse CSV
    const { headers, rows, totalRows } = parseCsv(content);

    // Auto-detect column mapping
    const suggestedMapping = autoDetectColumnMapping(headers);

    // Get sample data (first 5 rows)
    const sampleData = rows.slice(0, 5);

    return NextResponse.json({
      headers,
      total_rows: totalRows,
      suggested_mapping: suggestedMapping,
      sample_data: sampleData,
    });
  } catch (error) {
    console.error('CSV preview error:', error);
    return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 400 });
  }
}
