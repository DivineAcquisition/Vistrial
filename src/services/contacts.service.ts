// @ts-nocheck
// ============================================
// CONTACTS SERVICE
// Contact management and operations
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { formatToE164, isValidPhoneNumber, normalizePhone } from '@/lib/telnyx';
import type {
  Contact,
  ContactInsert,
  ContactUpdate,
  ContactStatus,
  Organization,
} from '@/types/database';

// ============================================
// CONTACT VALIDATION
// ============================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Normalize email (lowercase, trim)
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Validate and clean contact data
 */
export function validateContactData(data: Partial<ContactInsert>): {
  valid: boolean;
  errors: string[];
  cleaned: Partial<ContactInsert>;
} {
  const errors: string[] = [];
  const cleaned: Partial<ContactInsert> = { ...data };

  // Clean names
  if (cleaned.first_name) {
    cleaned.first_name = cleaned.first_name.trim().slice(0, 100);
  }
  if (cleaned.last_name) {
    cleaned.last_name = cleaned.last_name.trim().slice(0, 100);
  }

  // Validate and clean email
  if (cleaned.email) {
    cleaned.email = normalizeEmail(cleaned.email);
    if (!isValidEmail(cleaned.email)) {
      errors.push('Invalid email format');
      cleaned.email = undefined;
    }
  }

  // Validate and clean phone
  if (cleaned.phone) {
    try {
      if (isValidPhoneNumber(cleaned.phone)) {
        cleaned.phone = formatToE164(cleaned.phone);
      } else {
        errors.push('Invalid phone number');
        cleaned.phone = undefined;
      }
    } catch {
      errors.push('Invalid phone number format');
      cleaned.phone = undefined;
    }
  }

  // Must have at least email or phone
  if (!cleaned.email && !cleaned.phone) {
    errors.push('Contact must have either email or phone');
  }

  // Clean address fields
  if (cleaned.address_line1) {
    cleaned.address_line1 = cleaned.address_line1.trim().slice(0, 255);
  }
  if (cleaned.city) {
    cleaned.city = cleaned.city.trim().slice(0, 100);
  }
  if (cleaned.state) {
    cleaned.state = cleaned.state.trim().toUpperCase().slice(0, 50);
  }
  if (cleaned.zip_code) {
    cleaned.zip_code = cleaned.zip_code.trim().slice(0, 20);
  }

  // Clean tags
  if (cleaned.tags) {
    cleaned.tags = cleaned.tags
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length > 0)
      .slice(0, 50); // Max 50 tags
  }

  return {
    valid: errors.length === 0 || !!(cleaned.email || cleaned.phone),
    errors,
    cleaned,
  };
}

// ============================================
// CONTACT CRUD
// ============================================

/**
 * Create a new contact
 */
export async function createContact(
  organizationId: string,
  data: Omit<ContactInsert, 'organization_id'>
): Promise<Contact> {
  const admin = getSupabaseAdminClient();

  // Validate
  const { valid, errors, cleaned } = validateContactData(data);
  if (!valid && errors.length > 0 && !cleaned.email && !cleaned.phone) {
    throw new Error(`Invalid contact data: ${errors.join(', ')}`);
  }

  // Check contact limit
  const canAdd = await checkContactLimit(organizationId, 1);
  if (!canAdd) {
    throw new Error('Contact limit reached. Please upgrade your plan.');
  }

  // Check for duplicates
  const duplicate = await findDuplicateContact(organizationId, cleaned);
  if (duplicate) {
    throw new Error(`Duplicate contact found: ${duplicate.id}`);
  }

  const contactInsert: ContactInsert = {
    organization_id: organizationId,
    ...cleaned,
    status: 'active',
    sms_opted_in: !!cleaned.phone,
    email_opted_in: !!cleaned.email,
    voice_opted_in: !!cleaned.phone,
  };

  const { data: contact, error } = await admin
    .from('contacts')
    .insert(contactInsert)
    .select()
    .single();

  if (error || !contact) {
    throw new Error('Failed to create contact');
  }

  return contact;
}

/**
 * Update a contact
 */
export async function updateContact(contactId: string, data: ContactUpdate): Promise<Contact> {
  const admin = getSupabaseAdminClient();

  // Validate if email/phone provided
  if (data.email || data.phone) {
    const { cleaned } = validateContactData(data);
    if (data.email) data.email = cleaned.email;
    if (data.phone) data.phone = cleaned.phone;
  }

  const { data: contact, error } = await admin
    .from('contacts')
    .update(data)
    .eq('id', contactId)
    .select()
    .single();

  if (error || !contact) {
    throw new Error('Failed to update contact');
  }

  return contact;
}

/**
 * Soft delete a contact
 */
export async function deleteContact(contactId: string): Promise<void> {
  const admin = getSupabaseAdminClient();

  await admin
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', contactId);

  // Exit any active enrollments
  await admin
    .from('workflow_enrollments')
    .update({
      status: 'completed',
      exit_reason: 'contact_deleted',
      exited_at: new Date().toISOString(),
    })
    .eq('contact_id', contactId)
    .in('status', ['active', 'pending', 'paused']);
}

/**
 * Hard delete a contact (permanent)
 */
export async function permanentlyDeleteContact(contactId: string): Promise<void> {
  const admin = getSupabaseAdminClient();

  await admin.from('contacts').delete().eq('id', contactId);
}

/**
 * Get contact by ID
 */
export async function getContact(contactId: string): Promise<Contact | null> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get contact with enrollments
 */
export async function getContactWithEnrollments(contactId: string): Promise<
  Contact & {
    enrollments: Array<{
      id: string;
      workflow_id: string;
      workflow_name: string;
      status: string;
      current_step_index: number;
      enrolled_at: string;
    }>;
  }
> {
  const admin = getSupabaseAdminClient();

  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .is('deleted_at', null)
    .single();

  if (contactError || !contact) {
    throw new Error('Contact not found');
  }

  const { data: enrollments } = await admin
    .from('workflow_enrollments')
    .select(
      `
      id,
      workflow_id,
      status,
      current_step_index,
      enrolled_at,
      workflows (name)
    `
    )
    .eq('contact_id', contactId)
    .order('enrolled_at', { ascending: false });

  return {
    ...contact,
    enrollments: (enrollments || []).map((e) => ({
      id: e.id,
      workflow_id: e.workflow_id,
      workflow_name: (e.workflows as any)?.name || 'Unknown',
      status: e.status,
      current_step_index: e.current_step_index,
      enrolled_at: e.enrolled_at,
    })),
  };
}

// ============================================
// CONTACT QUERIES
// ============================================

export interface ContactFilters {
  status?: ContactStatus[];
  tags?: string[];
  source?: string;
  search?: string;
  has_email?: boolean;
  has_phone?: boolean;
  last_contacted_before?: string;
  last_contacted_after?: string;
  created_before?: string;
  created_after?: string;
}

export interface PaginationOptions {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * List contacts with filters and pagination
 */
export async function listContacts(
  organizationId: string,
  filters?: ContactFilters,
  pagination?: PaginationOptions
): Promise<{
  contacts: Contact[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}> {
  const admin = getSupabaseAdminClient();

  const page = pagination?.page || 1;
  const perPage = pagination?.per_page || 50;
  const sortBy = pagination?.sort_by || 'created_at';
  const sortOrder = pagination?.sort_order || 'desc';

  let query = admin
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  // Apply filters
  if (filters?.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags);
  }

  if (filters?.source) {
    query = query.eq('source', filters.source);
  }

  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    query = query.or(
      `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
    );
  }

  if (filters?.has_email) {
    query = query.not('email', 'is', null);
  }

  if (filters?.has_phone) {
    query = query.not('phone', 'is', null);
  }

  if (filters?.last_contacted_before) {
    query = query.lt('last_contacted_at', filters.last_contacted_before);
  }

  if (filters?.last_contacted_after) {
    query = query.gt('last_contacted_at', filters.last_contacted_after);
  }

  if (filters?.created_before) {
    query = query.lt('created_at', filters.created_before);
  }

  if (filters?.created_after) {
    query = query.gt('created_at', filters.created_after);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply pagination
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data: contacts, error, count } = await query;

  if (error) {
    throw new Error('Failed to list contacts');
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / perPage);

  return {
    contacts: contacts || [],
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
  };
}

/**
 * Count contacts matching criteria
 */
export async function countContacts(
  organizationId: string,
  filters?: ContactFilters
): Promise<number> {
  const admin = getSupabaseAdminClient();

  let query = admin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filters?.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error('Failed to count contacts');
  }

  return count || 0;
}

// ============================================
// DUPLICATE DETECTION
// ============================================

/**
 * Find duplicate contact by email or phone
 */
export async function findDuplicateContact(
  organizationId: string,
  data: Partial<ContactInsert>
): Promise<Contact | null> {
  const admin = getSupabaseAdminClient();

  const conditions: string[] = [];

  if (data.email) {
    conditions.push(`email.eq.${data.email}`);
  }

  if (data.phone) {
    // Check multiple phone formats
    const normalized = normalizePhone(data.phone);
    conditions.push(`phone.eq.${data.phone}`);
    conditions.push(`phone.eq.+1${normalized}`);
    conditions.push(`phone.eq.${normalized}`);
  }

  if (conditions.length === 0) {
    return null;
  }

  const { data: duplicates } = await admin
    .from('contacts')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .or(conditions.join(','))
    .limit(1);

  return duplicates && duplicates.length > 0 ? duplicates[0] : null;
}

// ============================================
// CONTACT LIMITS
// ============================================

/**
 * Check if organization can add more contacts
 */
export async function checkContactLimit(
  organizationId: string,
  count: number = 1
): Promise<boolean> {
  const admin = getSupabaseAdminClient();

  const { data } = await admin.rpc('can_add_contacts', {
    p_organization_id: organizationId,
    p_count: count,
  });

  return data === true;
}

/**
 * Get current contact count
 */
export async function getContactCount(organizationId: string): Promise<number> {
  const admin = getSupabaseAdminClient();

  const { data } = await admin.rpc('get_contact_count', {
    p_organization_id: organizationId,
  });

  return data || 0;
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Bulk add tags to contacts
 */
export async function bulkAddTags(contactIds: string[], tags: string[]): Promise<number> {
  const admin = getSupabaseAdminClient();

  const normalizedTags = tags.map((t) => t.toLowerCase().trim());

  let updated = 0;

  for (const contactId of contactIds) {
    const { data: contact } = await admin
      .from('contacts')
      .select('tags')
      .eq('id', contactId)
      .single();

    if (contact) {
      const existingTags = (contact.tags as string[]) || [];
      const newTags = [...new Set([...existingTags, ...normalizedTags])];

      const { error } = await admin.from('contacts').update({ tags: newTags }).eq('id', contactId);

      if (!error) updated++;
    }
  }

  return updated;
}

/**
 * Bulk remove tags from contacts
 */
export async function bulkRemoveTags(contactIds: string[], tags: string[]): Promise<number> {
  const admin = getSupabaseAdminClient();

  const normalizedTags = tags.map((t) => t.toLowerCase().trim());

  let updated = 0;

  for (const contactId of contactIds) {
    const { data: contact } = await admin
      .from('contacts')
      .select('tags')
      .eq('id', contactId)
      .single();

    if (contact) {
      const existingTags = (contact.tags as string[]) || [];
      const newTags = existingTags.filter((t) => !normalizedTags.includes(t));

      const { error } = await admin.from('contacts').update({ tags: newTags }).eq('id', contactId);

      if (!error) updated++;
    }
  }

  return updated;
}

/**
 * Bulk update contact status
 */
export async function bulkUpdateStatus(
  contactIds: string[],
  status: ContactStatus
): Promise<number> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('contacts')
    .update({ status })
    .in('id', contactIds)
    .select('id');

  if (error) {
    throw new Error('Failed to update contacts');
  }

  // If marking as unsubscribed or do_not_contact, exit enrollments
  if (status === 'unsubscribed' || status === 'do_not_contact') {
    await admin
      .from('workflow_enrollments')
      .update({
        status: 'completed',
        exit_reason: `contact_${status}`,
        exited_at: new Date().toISOString(),
      })
      .in('contact_id', contactIds)
      .in('status', ['active', 'pending', 'paused']);
  }

  return data?.length || 0;
}

/**
 * Bulk delete contacts
 */
export async function bulkDeleteContacts(contactIds: string[]): Promise<number> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', contactIds)
    .select('id');

  if (error) {
    throw new Error('Failed to delete contacts');
  }

  // Exit enrollments
  await admin
    .from('workflow_enrollments')
    .update({
      status: 'completed',
      exit_reason: 'contact_deleted',
      exited_at: new Date().toISOString(),
    })
    .in('contact_id', contactIds)
    .in('status', ['active', 'pending', 'paused']);

  return data?.length || 0;
}

// ============================================
// BACKWARD COMPATIBILITY EXPORT
// Legacy class-like export for existing code
// ============================================

export const contactsService = {
  getById: getContact,
  getByIdWithEnrollments: getContactWithEnrollments,
  create: createContact,
  update: updateContact,
  delete: deleteContact,
  list: listContacts,
  count: countContacts,
  findDuplicate: findDuplicateContact,
  checkLimit: checkContactLimit,
  getCount: getContactCount,
  bulkAddTags,
  bulkRemoveTags,
  bulkUpdateStatus,
  bulkDelete: bulkDeleteContacts,
  validateData: validateContactData,
  isValidEmail,
  normalizeEmail,

  // Additional methods that may be used
  async markContacted(contactId: string, _businessId?: string) {
    const admin = getSupabaseAdminClient();
    await admin
      .from('contacts')
      .update({ last_contacted_at: new Date().toISOString() })
      .eq('id', contactId);
  },
};
