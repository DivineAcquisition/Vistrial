// @ts-nocheck
// ============================================
// CONTACT IMPORT SERVICE
// CSV import processing
// ============================================

import Papa from 'papaparse';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  validateContactData,
  findDuplicateContact,
  checkContactLimit,
  getContactCount,
} from './contacts.service';
import type { ContactImport, ContactInsert, ColumnMapping, ImportError } from '@/types/database';

// ============================================
// CSV PARSING
// ============================================

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

/**
 * Parse CSV file content
 */
export function parseCsv(content: string): ParsedCsvResult {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
  });

  return {
    headers: result.meta.fields || [],
    rows: result.data,
    totalRows: result.data.length,
  };
}

/**
 * Auto-detect column mapping from headers
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  const fieldPatterns: Record<string, RegExp[]> = {
    first_name: [/^first[_\s]?name$/i, /^fname$/i, /^first$/i, /^given[_\s]?name$/i],
    last_name: [
      /^last[_\s]?name$/i,
      /^lname$/i,
      /^last$/i,
      /^surname$/i,
      /^family[_\s]?name$/i,
    ],
    email: [/^e?mail$/i, /^email[_\s]?address$/i],
    phone: [
      /^phone$/i,
      /^phone[_\s]?number$/i,
      /^mobile$/i,
      /^cell$/i,
      /^tel$/i,
      /^telephone$/i,
    ],
    address_line1: [/^address$/i, /^address[_\s]?1$/i, /^street$/i, /^street[_\s]?address$/i],
    city: [/^city$/i, /^town$/i],
    state: [/^state$/i, /^province$/i, /^region$/i],
    zip_code: [/^zip$/i, /^zip[_\s]?code$/i, /^postal$/i, /^postal[_\s]?code$/i],
    notes: [/^notes?$/i, /^comments?$/i, /^description$/i],
    tags: [/^tags?$/i, /^labels?$/i, /^categories?$/i],
  };

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().replace(/\s+/g, '_');

    for (const [field, patterns] of Object.entries(fieldPatterns)) {
      if (patterns.some((pattern) => pattern.test(normalizedHeader))) {
        if (!mapping[field]) {
          mapping[field] = header;
        }
        break;
      }
    }
  }

  return mapping;
}

// ============================================
// IMPORT PROCESSING
// ============================================

export interface ImportOptions {
  organizationId: string;
  fileName: string;
  content: string;
  columnMapping: ColumnMapping;
  source?: string;
  defaultTags?: string[];
  skipDuplicates?: boolean;
  updateExisting?: boolean;
}

export interface ImportResult {
  importId: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateRows: number;
  errors: ImportError[];
}

/**
 * Create import job record
 */
export async function createImportJob(
  organizationId: string,
  fileName: string,
  columnMapping: ColumnMapping,
  totalRows: number
): Promise<ContactImport> {
  const admin = getSupabaseAdminClient();

  const { data: importJob, error } = await admin
    .from('contact_imports')
    .insert({
      organization_id: organizationId,
      file_name: fileName,
      total_rows: totalRows,
      processed_rows: 0,
      successful_rows: 0,
      failed_rows: 0,
      duplicate_rows: 0,
      status: 'pending',
      column_mapping: columnMapping,
      errors: [],
    })
    .select()
    .single();

  if (error || !importJob) {
    throw new Error('Failed to create import job');
  }

  return importJob;
}

/**
 * Update import job progress
 */
async function updateImportProgress(
  importId: string,
  updates: Partial<{
    status: string;
    processed_rows: number;
    successful_rows: number;
    failed_rows: number;
    duplicate_rows: number;
    errors: ImportError[];
    error_message: string;
    started_at: string;
    completed_at: string;
  }>
): Promise<void> {
  const admin = getSupabaseAdminClient();

  await admin.from('contact_imports').update(updates).eq('id', importId);
}

/**
 * Process CSV import
 */
export async function processImport(options: ImportOptions): Promise<ImportResult> {
  const admin = getSupabaseAdminClient();

  // Parse CSV
  const { rows, totalRows } = parseCsv(options.content);

  // Check contact limit
  const currentCount = await getContactCount(options.organizationId);

  // Get organization contact limit
  const { data: org } = await admin
    .from('organizations')
    .select('contact_limit')
    .eq('id', options.organizationId)
    .single();

  const contactLimit = org?.contact_limit || 1000;
  const remainingSlots = contactLimit - currentCount;

  // Create import job
  const importJob = await createImportJob(
    options.organizationId,
    options.fileName,
    options.columnMapping,
    totalRows
  );

  // Update status to processing
  await updateImportProgress(importJob.id, {
    status: 'processing',
    started_at: new Date().toISOString(),
  });

  const errors: ImportError[] = [];
  let processedRows = 0;
  let successfulRows = 0;
  let failedRows = 0;
  let duplicateRows = 0;

  // Process rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // Account for header row

    try {
      // Check if we've hit the limit
      if (successfulRows >= remainingSlots) {
        errors.push({
          row: rowNumber,
          field: 'limit',
          value: '',
          error: 'Contact limit reached',
        });
        failedRows++;
        processedRows++;
        continue;
      }

      // Map row to contact data
      const contactData = mapRowToContact(row, options.columnMapping, options);

      // Validate
      const { valid, errors: validationErrors, cleaned } = validateContactData(contactData);

      if (!valid && !cleaned.email && !cleaned.phone) {
        errors.push({
          row: rowNumber,
          field: 'validation',
          value: JSON.stringify(contactData),
          error: validationErrors.join(', '),
        });
        failedRows++;
        processedRows++;
        continue;
      }

      // Check for duplicates
      const duplicate = await findDuplicateContact(options.organizationId, cleaned);

      if (duplicate) {
        if (options.updateExisting) {
          // Update existing contact
          await admin
            .from('contacts')
            .update({
              ...cleaned,
              updated_at: new Date().toISOString(),
            })
            .eq('id', duplicate.id);
          successfulRows++;
        } else if (options.skipDuplicates) {
          duplicateRows++;
        } else {
          errors.push({
            row: rowNumber,
            field: 'duplicate',
            value: cleaned.email || cleaned.phone || '',
            error: `Duplicate contact: ${duplicate.id}`,
          });
          duplicateRows++;
        }
        processedRows++;
        continue;
      }

      // Create contact
      const contactInsert: ContactInsert = {
        organization_id: options.organizationId,
        ...cleaned,
        source: options.source || 'csv_import',
        source_id: `import_${importJob.id}_row_${rowNumber}`,
        status: 'active',
        sms_opted_in: !!cleaned.phone,
        email_opted_in: !!cleaned.email,
        voice_opted_in: !!cleaned.phone,
      };

      const { error: insertError } = await admin.from('contacts').insert(contactInsert);

      if (insertError) {
        errors.push({
          row: rowNumber,
          field: 'insert',
          value: '',
          error: insertError.message,
        });
        failedRows++;
      } else {
        successfulRows++;
      }

      processedRows++;

      // Update progress every 100 rows
      if (processedRows % 100 === 0) {
        await updateImportProgress(importJob.id, {
          processed_rows: processedRows,
          successful_rows: successfulRows,
          failed_rows: failedRows,
          duplicate_rows: duplicateRows,
          errors: errors.slice(-100), // Keep last 100 errors
        });
      }
    } catch (error) {
      errors.push({
        row: rowNumber,
        field: 'unknown',
        value: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failedRows++;
      processedRows++;
    }
  }

  // Final update
  await updateImportProgress(importJob.id, {
    status: failedRows === totalRows ? 'failed' : 'completed',
    processed_rows: processedRows,
    successful_rows: successfulRows,
    failed_rows: failedRows,
    duplicate_rows: duplicateRows,
    errors: errors.slice(-500), // Keep last 500 errors
    completed_at: new Date().toISOString(),
  });

  return {
    importId: importJob.id,
    totalRows,
    processedRows,
    successfulRows,
    failedRows,
    duplicateRows,
    errors: errors.slice(0, 100), // Return first 100 errors
  };
}

/**
 * Map CSV row to contact data using column mapping
 */
function mapRowToContact(
  row: Record<string, string>,
  mapping: ColumnMapping,
  options: ImportOptions
): Partial<ContactInsert> {
  const contact: Partial<ContactInsert> = {};

  // Map basic fields
  if (mapping.first_name && row[mapping.first_name]) {
    contact.first_name = row[mapping.first_name].trim();
  }

  if (mapping.last_name && row[mapping.last_name]) {
    contact.last_name = row[mapping.last_name].trim();
  }

  if (mapping.email && row[mapping.email]) {
    contact.email = row[mapping.email].trim();
  }

  if (mapping.phone && row[mapping.phone]) {
    contact.phone = row[mapping.phone].trim();
  }

  if (mapping.address_line1 && row[mapping.address_line1]) {
    contact.address_line1 = row[mapping.address_line1].trim();
  }

  if (mapping.city && row[mapping.city]) {
    contact.city = row[mapping.city].trim();
  }

  if (mapping.state && row[mapping.state]) {
    contact.state = row[mapping.state].trim();
  }

  if (mapping.zip_code && row[mapping.zip_code]) {
    contact.zip_code = row[mapping.zip_code].trim();
  }

  if (mapping.notes && row[mapping.notes]) {
    contact.notes = row[mapping.notes].trim();
  }

  // Handle tags
  let tags: string[] = [];

  if (mapping.tags && row[mapping.tags]) {
    // Tags can be comma-separated
    tags = row[mapping.tags]
      .split(/[,;]/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  }

  if (options.defaultTags && options.defaultTags.length > 0) {
    tags = [...tags, ...options.defaultTags];
  }

  if (tags.length > 0) {
    contact.tags = [...new Set(tags)]; // Remove duplicates
  }

  return contact;
}

/**
 * Get import job status
 */
export async function getImportStatus(importId: string): Promise<ContactImport | null> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('contact_imports')
    .select('*')
    .eq('id', importId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * List import jobs for organization
 */
export async function listImports(
  organizationId: string,
  limit: number = 20
): Promise<ContactImport[]> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('contact_imports')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error('Failed to list imports');
  }

  return data || [];
}
