"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RiSearchLine, RiCloseLine } from "@remixicon/react";
import { useState } from "react";

interface BookingsFiltersProps {
  currentStatus?: string;
  currentDate?: string;
  currentSearch?: string;
}

const STATUSES = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function BookingsFilters({
  currentStatus,
  currentDate,
  currentSearch,
}: BookingsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch || "");

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // Reset to page 1 when filters change
    params.delete("page");

    router.push(`/bookings?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: search || null });
  };

  const clearFilters = () => {
    setSearch("");
    router.push("/bookings");
  };

  const hasFilters = currentStatus || currentDate || currentSearch;

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <RiSearchLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or address..."
            className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>
      </form>

      {/* Status Filter */}
      <select
        value={currentStatus || "all"}
        onChange={(e) =>
          updateFilters({ status: e.target.value === "all" ? null : e.target.value })
        }
        className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all appearance-none cursor-pointer"
      >
        {STATUSES.map((status) => (
          <option
            key={status.value}
            value={status.value}
            className="bg-gray-900 text-white"
          >
            {status.label}
          </option>
        ))}
      </select>

      {/* Date Filter */}
      <input
        type="date"
        value={currentDate || ""}
        onChange={(e) => updateFilters({ date: e.target.value || null })}
        className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all [color-scheme:dark]"
      />

      {/* Clear Filters */}
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-white transition-colors"
        >
          <RiCloseLine className="w-5 h-5" />
          Clear
        </button>
      )}
    </div>
  );
}
