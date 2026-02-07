// ============================================
// Conversions page
// ============================================

import { LineChart } from "lucide-react";

export default function ConversionsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Conversions
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Track booking page visits and conversion rates
        </p>
      </div>

      <div className="rounded-xl border bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <LineChart className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
        <h3 className="mb-2 text-lg font-medium text-slate-900 dark:text-slate-100">
          No conversion data yet
        </h3>
        <p className="text-slate-500 dark:text-slate-400">
          Conversion analytics will appear here once you start receiving traffic
          to your booking page.
        </p>
      </div>
    </div>
  );
}
