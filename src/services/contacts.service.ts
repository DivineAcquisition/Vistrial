/**
 * Contacts Service
 * 
 * Business logic for contact management:
 * - CRUD operations
 * - Bulk import/export
 * - Duplicate detection
 * - Phone number normalization
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneNumber } from "@/lib/utils/validation";

export interface Contact {
  id: string;
  business_id: string;
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  status: "active" | "opted_out" | "unsubscribed";
  notes?: string;
  tags?: string[];
  custom_fields?: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_contacted_at?: string;
}

export interface ContactCreateInput {
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

export interface ContactListOptions {
  businessId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  workflowId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ContactListResult {
  contacts: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class ContactsService {
  /**
   * List contacts with pagination and filtering
   */
  async list(options: ContactListOptions): Promise<ContactListResult> {
    const {
      businessId,
      page = 1,
      limit = 50,
      search = "",
      status = "",
      sortBy = "created_at",
      sortOrder = "desc",
    } = options;

    const supabase = createAdminClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .eq("business_id", businessId);

    // Apply search filter
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    // Apply status filter
    if (status) {
      query = query.eq("status", status);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === "asc" });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    return {
      contacts: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single contact by ID
   */
  async getById(id: string, businessId: string): Promise<Contact | null> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .eq("business_id", businessId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return data;
  }

  /**
   * Create a new contact
   */
  async create(businessId: string, input: ContactCreateInput): Promise<Contact> {
    const supabase = createAdminClient();

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(input.phone);

    // Check for duplicate
    const existing = await this.findByPhone(businessId, normalizedPhone);
    if (existing) {
      throw new Error("Contact with this phone number already exists");
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        business_id: businessId,
        ...input,
        phone: normalizedPhone,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a contact
   */
  async update(
    id: string,
    businessId: string,
    updates: Partial<ContactCreateInput>
  ): Promise<Contact> {
    const supabase = createAdminClient();

    // Normalize phone if provided
    if (updates.phone) {
      updates.phone = normalizePhoneNumber(updates.phone);
    }

    const { data, error } = await supabase
      .from("contacts")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a contact
   */
  async delete(id: string, businessId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("business_id", businessId);

    if (error) throw error;
  }

  /**
   * Find contact by phone number
   */
  async findByPhone(businessId: string, phone: string): Promise<Contact | null> {
    const supabase = createAdminClient();
    const normalizedPhone = normalizePhoneNumber(phone);

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("business_id", businessId)
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Bulk import contacts
   */
  async bulkImport(
    businessId: string,
    contacts: ContactCreateInput[],
    options?: { skipDuplicates?: boolean; updateExisting?: boolean }
  ): Promise<{ imported: number; skipped: number; errors: Array<{ row: number; error: string }> }> {
    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const rowNum = i + 1;

      try {
        const normalizedPhone = normalizePhoneNumber(contact.phone);
        const existing = await this.findByPhone(businessId, normalizedPhone);

        if (existing) {
          if (options?.updateExisting) {
            await this.update(existing.id, businessId, contact);
            results.imported++;
          } else if (options?.skipDuplicates) {
            results.skipped++;
          } else {
            results.errors.push({ row: rowNum, error: "Duplicate phone number" });
          }
        } else {
          await this.create(businessId, contact);
          results.imported++;
        }
      } catch (err) {
        results.errors.push({
          row: rowNum,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Update contact opted-out status
   */
  async optOut(businessId: string, phone: string): Promise<void> {
    const supabase = createAdminClient();
    const normalizedPhone = normalizePhoneNumber(phone);

    const { error } = await supabase
      .from("contacts")
      .update({ status: "opted_out", updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("phone", normalizedPhone);

    if (error) throw error;
  }

  /**
   * Mark contact as last contacted
   */
  async markContacted(id: string, businessId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("contacts")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId);

    if (error) throw error;
  }
}

export const contactsService = new ContactsService();
