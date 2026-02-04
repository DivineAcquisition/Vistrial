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
import { Users, Upload, Search, Filter } from "lucide-react";

export const dynamic = "force-dynamic";

function ContactsTableSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 bg-gray-800 rounded w-full" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-800/50 rounded" />
      ))}
    </div>
  );
}

export default async function ContactsPage() {
  // TODO: Implement with contacts.service.ts
  // - Fetch contacts with pagination
  // - Support search, filter, sort query params
  // - Include workflow enrollment status

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-gray-400 mt-1">
            Manage your lead database and workflow enrollments
          </p>
        </div>
        <Link
          href="/contacts/upload"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
        >
          <Upload className="w-5 h-5" />
          Import Contacts
        </Link>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-white/10 rounded-xl text-gray-300 hover:bg-gray-800 transition-colors">
          <Filter className="w-5 h-5" />
          Filters
        </button>
      </div>

      {/* Contacts Table */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <Suspense fallback={<ContactsTableSkeleton />}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-sm font-medium text-gray-400">
                    <input type="checkbox" className="rounded border-gray-600" />
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Name</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Phone</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Email</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Workflow</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Added</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {/* Placeholder empty state */}
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                      <Users className="w-8 h-8 text-gray-500" />
                    </div>
                    <p className="text-gray-400 mb-4">No contacts yet</p>
                    <Link
                      href="/contacts/upload"
                      className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 font-medium"
                    >
                      <Upload className="w-4 h-4" />
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
