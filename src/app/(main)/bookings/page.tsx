// ============================================
// Bookings page
// ============================================

import { CalendarCheck } from "lucide-react";

export default function BookingsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Bookings
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your upcoming and past bookings
        </p>
      </div>

      <div className="rounded-xl border bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <CalendarCheck className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
        <h3 className="mb-2 text-lg font-medium text-slate-900 dark:text-slate-100">
          No bookings yet
        </h3>
        <p className="text-slate-500 dark:text-slate-400">
          Bookings will appear here once customers start booking through your
          booking page.
        </p>
      </div>
    </div>
  );
}
