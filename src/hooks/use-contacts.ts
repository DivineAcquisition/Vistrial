// @ts-nocheck
/**
 * useContacts Hook
 * 
 * Hook for managing contacts:
 * - Paginated contact list
 * - Search and filter
 * - CRUD operations
 * - Bulk actions
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useOrganization } from "./use-organization";

interface Contact {
  id: string;
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  status: "active" | "opted_out" | "unsubscribed";
  workflow_id?: string;
  notes?: string;
  created_at: string;
  last_contacted_at?: string;
}

interface ContactsFilter {
  search?: string;
  status?: string;
  workflow_id?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UseContactsReturn {
  contacts: Contact[];
  pagination: Pagination;
  loading: boolean;
  error: Error | null;
  filters: ContactsFilter;
  setFilters: (filters: ContactsFilter) => void;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
  createContact: (contact: Omit<Contact, "id" | "created_at">) => Promise<Contact>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  deleteContacts: (ids: string[]) => Promise<void>;
}

export function useContacts(initialFilters?: ContactsFilter): UseContactsReturn {
  const { organization } = useOrganization();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<ContactsFilter>(initialFilters || {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContacts = useCallback(async () => {
    if (!organization) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        ...(filters.search && { search: filters.search }),
        ...(filters.status && { status: filters.status }),
        ...(filters.workflow_id && { workflow_id: filters.workflow_id }),
      });

      const response = await fetch(`/api/contacts?${params}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch contacts");
      }

      const data = await response.json();
      setContacts(data.contacts || []);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0,
      }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch contacts"));
    } finally {
      setLoading(false);
    }
  }, [organization, pagination.page, pagination.limit, filters]);

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const createContact = useCallback(async (
    contact: Omit<Contact, "id" | "created_at">
  ): Promise<Contact> => {
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create contact");
    }

    const data = await response.json();
    await fetchContacts(); // Refresh list
    return data.contact;
  }, [fetchContacts]);

  const updateContact = useCallback(async (
    id: string,
    updates: Partial<Contact>
  ): Promise<void> => {
    const response = await fetch(`/api/contacts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to update contact");
    }

    // Update local state
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const deleteContact = useCallback(async (id: string): Promise<void> => {
    const response = await fetch(`/api/contacts/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to delete contact");
    }

    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const deleteContacts = useCallback(async (ids: string[]): Promise<void> => {
    // Bulk delete
    await Promise.all(ids.map((id) => deleteContact(id)));
  }, [deleteContact]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return {
    contacts,
    pagination,
    loading,
    error,
    filters,
    setFilters,
    setPage,
    refresh: fetchContacts,
    createContact,
    updateContact,
    deleteContact,
    deleteContacts,
  };
}
