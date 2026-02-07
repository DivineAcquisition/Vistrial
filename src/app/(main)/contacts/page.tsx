// ============================================
// Contacts page
// ============================================

import { Users } from "lucide-react";

export default function ContactsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Contacts
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your customer contacts and leads
        </p>
      </div>

      <div className="rounded-xl border bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <Users className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
        <h3 className="mb-2 text-lg font-medium text-slate-900 dark:text-slate-100">
          No contacts yet
        </h3>
        <p className="text-slate-500 dark:text-slate-400">
          Contacts will be automatically created when customers book or fill out
          your booking form.
        </p>
      </div>
    </div>
  );
}
