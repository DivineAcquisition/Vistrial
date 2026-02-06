/**
 * Contacts Page
 * 
 * This page displays the main contacts table with:
 * - Searchable, filterable, sortable table of all contacts
 * - Contact status indicators (active, opted-out, unsubscribed)
 * - Workflow enrollment status
 * - Quick actions: view, edit, enroll in workflow
 * - Bulk operations: select multiple, enroll, export
 * - Import button linking to /contacts/upload
 */

import { Suspense } from "react";
import Link from "next/link";
import { RiGroupLine, RiUploadLine, RiSearchLine, RiFilter3Line } from "@remixicon/react";

export const dynamic = "force-dynamic";

function ContactsTableSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 bg-gray-100 rounded w-full" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-50 rounded" />
      ))}
    </div>
  );
}

export default async function ContactsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">
            Manage your lead database and workflow enrollments
          </p>
        </div>
        <Link
          href="/contacts/upload"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition-colors"
        >
          <RiUploadLine className="w-5 h-5" />
          Import Contacts
        </Link>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
          />
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
          <RiFilter3Line className="w-5 h-5" />
          Filters
        </button>
      </div>

      {/* Contacts Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Suspense fallback={<ContactsTableSkeleton />}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left p-4 text-sm font-medium text-gray-600">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Name</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Phone</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Email</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Workflow</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Added</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Placeholder empty state */}
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
                      <RiGroupLine className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 mb-4">No contacts yet</p>
                    <Link
                      href="/contacts/upload"
                      className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium"
                    >
                      <RiUploadLine className="w-4 h-4" />
                      Import your first contacts
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Suspense>
      </div>
    </div>
  );
}
