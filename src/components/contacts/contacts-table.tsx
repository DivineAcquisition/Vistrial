/**
 * Contacts Table Component
 * 
 * Data table for displaying contacts with:
 * - Sortable columns (name, phone, email, status, added date)
 * - Row selection for bulk actions
 * - Status badges (active, opted_out, unsubscribed)
 * - Workflow enrollment indicator
 * - Quick action menu (view, edit, enroll, delete)
 * - Pagination
 * - Loading states
 * 
 * Uses: @tanstack/react-table
 */

"use client";

import { useState } from "react";
import { MoreHorizontal, User, Phone, Mail, CheckCircle2, XCircle } from "lucide-react";

interface Contact {
  id: string;
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  status: "active" | "opted_out" | "unsubscribed";
  workflow_id?: string;
  created_at: string;
}

interface ContactsTableProps {
  contacts: Contact[];
  loading?: boolean;
  onSelect?: (ids: string[]) => void;
  onAction?: (action: string, contact: Contact) => void;
}

const statusConfig = {
  active: { label: "Active", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  opted_out: { label: "Opted Out", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  unsubscribed: { label: "Unsubscribed", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

export function ContactsTable({ contacts, loading, onSelect, onAction }: ContactsTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    onSelect?.(Array.from(newSelected));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
      onSelect?.([]);
    } else {
      const allIds = new Set(contacts.map((c) => c.id));
      setSelectedIds(allIds);
      onSelect?.(Array.from(allIds));
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-50 rounded" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
          <User className="w-8 h-8 text-gray-500" />
        </div>
        <p className="text-gray-400">No contacts found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left p-4">
              <input
                type="checkbox"
                checked={selectedIds.size === contacts.length}
                onChange={toggleSelectAll}
                className="rounded border-gray-600"
              />
            </th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Name</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Phone</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Email</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Status</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Workflow</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Added</th>
            <th className="text-left p-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {contacts.map((contact) => {
            const status = statusConfig[contact.status];
            return (
              <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(contact.id)}
                    onChange={() => toggleSelect(contact.id)}
                    className="rounded border-gray-600"
                  />
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                      <span className="text-gray-900 text-sm font-medium">
                        {contact.first_name.charAt(0)}
                      </span>
                    </div>
                    <span className="text-gray-900 font-medium">
                      {contact.first_name} {contact.last_name}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-gray-300">{contact.phone}</td>
                <td className="p-4 text-gray-300">{contact.email || "-"}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded border ${status.color}`}>
                    {status.label}
                  </span>
                </td>
                <td className="p-4">
                  {contact.workflow_id ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-500" />
                  )}
                </td>
                <td className="p-4 text-gray-400 text-sm">
                  {new Date(contact.created_at).toLocaleDateString()}
                </td>
                <td className="p-4">
                  <button
                    onClick={() => onAction?.("menu", contact)}
                    className="p-2 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-50"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
