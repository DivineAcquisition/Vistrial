"use client";

import Link from "next/link";
import {
  RiCalendarLine,
  RiTimeLine,
  RiCheckLine,
  RiAddLine,
} from "@remixicon/react";

interface BookingsHeaderProps {
  todayCount: number;
  pendingCount: number;
  confirmedCount: number;
}

export function BookingsHeader({
  todayCount,
  pendingCount,
  confirmedCount,
}: BookingsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Bookings
        </h1>
        <p className="text-gray-400">Manage your scheduled cleanings</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Quick Stats */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500/20 rounded-lg flex items-center justify-center">
              <RiCalendarLine className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <span className="text-gray-500">Today</span>
              <span className="ml-2 font-semibold text-white">{todayCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <RiTimeLine className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <span className="text-gray-500">Pending</span>
              <span className="ml-2 font-semibold text-white">{pendingCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <RiCheckLine className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <span className="text-gray-500">Upcoming</span>
              <span className="ml-2 font-semibold text-white">{confirmedCount}</span>
            </div>
          </div>
        </div>

        <Link
          href="/bookings/new"
          className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white overflow-hidden transition-all duration-300 hover:scale-[1.02]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <RiAddLine className="relative w-5 h-5" />
          <span className="relative">New Booking</span>
        </Link>
      </div>
    </div>
  );
}
