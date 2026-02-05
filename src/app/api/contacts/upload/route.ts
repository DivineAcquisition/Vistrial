// @ts-nocheck
// ============================================
// CONTACT CSV UPLOAD API
// Handle CSV file upload and import
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { parseCsv, autoDetectColumnMapping, processImport } from '@/services/contact-import.service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const columnMappingStr = formData.get('column_mapping') as string;
    const source = formData.get('source') as string;
    const defaultTagsStr = formData.get('default_tags') as string;
    const skipDuplicates = formData.get('skip_duplicates') === 'true';
    const updateExisting = formData.get('update_existing') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 });
    }

    // Read file content
    const content = await file.text();

    // Parse to get headers
    const { headers, totalRows } = parseCsv(content);

    if (totalRows === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
    }

    // Get column mapping
    let columnMapping = columnMappingStr
      ? JSON.parse(columnMappingStr)
      : autoDetectColumnMapping(headers);

    // Parse default tags
    const defaultTags = defaultTagsStr ? defaultTagsStr.split(',').map((t) => t.trim()) : [];

    // Process import
    const result = await processImport({
      organizationId: context.organization.id,
      fileName: file.name,
      content,
      columnMapping,
      source: source || 'csv_import',
      defaultTags,
      skipDuplicates,
      updateExisting,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Contact upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process upload' },
      { status: 500 }
    );
  }
}
