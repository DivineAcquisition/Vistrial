/**
 * Contacts Page
 *
 * Server component that fetches contacts from Supabase and displays them in a table.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import {
  RiGroupLine,
  RiUploadLine,
  RiAddLine,
} from '@remixicon/react';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import type { ContactStatus } from '@/types/database';

export const metadata: Metadata = {
  title: 'Contacts',
  description: 'Manage your lead database and workflow enrollments',
};

export const dynamic = 'force-dynamic';

function StatusBadge({ status }: { status: ContactStatus }) {
  const styles: Record<ContactStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    unsubscribed: 'bg-gray-100 text-gray-600 border-gray-200',
    bounced: 'bg-amber-50 text-amber-700 border-amber-200',
    invalid: 'bg-red-50 text-red-700 border-red-200',
    do_not_contact: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const label = status.replace(/_/g, ' ');
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] || styles.unsubscribed}`}
    >
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function ContactsPage() {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  const supabase = await getSupabaseServerClient();
  const org = context.organization as { id: string };

  const { data: contacts, count } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone, email, status, created_at', {
      count: 'exact',
    })
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  type ContactRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    status: ContactStatus;
    created_at: string;
  };
  const contactList: ContactRow[] = contacts || [];
  const contactCount = count ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">
            {contactCount === 0
              ? 'Manage your lead database and workflow enrollments'
              : `${contactCount} contact${contactCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/contacts/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition-colors"
          >
            <RiAddLine className="w-5 h-5" />
            Add Contact
          </Link>
          <Link
            href="/contacts/upload"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RiUploadLine className="w-5 h-5" />
            Import CSV
          </Link>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left p-4 text-sm font-medium text-gray-600">
                  Name
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-600">
                  Phone
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-600">
                  Email
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-600">
                  Status
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-600">
                  Added
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contactList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
                      <RiGroupLine className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 mb-4">No contacts yet</p>
                    <div className="flex items-center justify-center gap-3">
                      <Link
                        href="/contacts/new"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition-colors"
                      >
                        <RiAddLine className="w-4 h-4" />
                        Add your first contact
                      </Link>
                      <Link
                        href="/contacts/upload"
                        className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium"
                      >
                        <RiUploadLine className="w-4 h-4" />
                        Import CSV
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                contactList.map((contact) => (
                  <tr key={contact.id} className="hover:bg-gray-50/50">
                    <td className="p-4 text-sm text-gray-900">
                      {[contact.first_name, contact.last_name]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {contact.phone || '—'}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {contact.email || '—'}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={contact.status as ContactStatus} />
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {formatDate(contact.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
