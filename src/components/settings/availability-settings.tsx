"use client";

import { useState } from "react";
import {
  RiTimeLine,
  RiAddLine,
  RiDeleteBinLine,
  RiCalendarLine,
} from "@remixicon/react";

interface AvailabilitySlot {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  capacity: number;
}

interface BlackoutDate {
  id: string;
  date: string;
  reason: string | null;
}

interface AvailabilitySettingsProps {
  businessId: string;
  availability: AvailabilitySlot[];
  blackoutDates: BlackoutDate[];
}

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function AvailabilitySettings({
  businessId,
  availability: initialAvailability,
  blackoutDates: initialBlackouts,
}: AvailabilitySettingsProps) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [blackoutDates, setBlackoutDates] = useState(initialBlackouts);

  // Build schedule by day
  const scheduleByDay = DAYS.map((day) => {
    const slot = availability.find((a) => a.day_of_week === day.value);
    return {
      ...day,
      slot,
      isAvailable: slot?.is_available || false,
      startTime: slot?.start_time || "08:00",
      endTime: slot?.end_time || "17:00",
    };
  });

  const updateDay = async (
    dayOfWeek: number,
    updates: Partial<AvailabilitySlot>
  ) => {
    const existing = availability.find((a) => a.day_of_week === dayOfWeek);

    const response = await fetch("/api/settings/availability", {
      method: existing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        slot: {
          id: existing?.id,
          day_of_week: dayOfWeek,
          start_time: existing?.start_time || "08:00",
          end_time: existing?.end_time || "17:00",
          is_available: existing?.is_available || false,
          ...updates,
        },
      }),
    });

    if (response.ok) {
      const saved = await response.json();
      if (existing) {
        setAvailability(
          availability.map((a) => (a.id === saved.id ? saved : a))
        );
      } else {
        setAvailability([...availability, saved]);
      }
    }
  };

  const addBlackout = async (date: string, reason: string) => {
    const response = await fetch("/api/settings/blackout-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, date, reason }),
    });

    if (response.ok) {
      const saved = await response.json();
      setBlackoutDates(
        [...blackoutDates, saved].sort((a, b) => a.date.localeCompare(b.date))
      );
    }
  };

  const removeBlackout = async (id: string) => {
    await fetch(`/api/settings/blackout-dates/${id}`, { method: "DELETE" });
    setBlackoutDates(blackoutDates.filter((b) => b.id !== id));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Availability</h1>
        <p className="text-slate-500">
          Set your working hours and blackout dates
        </p>
      </div>

      {/* Weekly Schedule */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <RiTimeLine className="w-5 h-5 text-violet-600" />
          Weekly Schedule
        </h2>

        <div className="space-y-3">
          {scheduleByDay.map((day) => (
            <div
              key={day.value}
              className={`flex items-center gap-4 p-3 rounded-lg ${
                day.isAvailable ? "bg-green-50" : "bg-slate-50"
              }`}
            >
              <label className="flex items-center gap-3 w-32">
                <input
                  type="checkbox"
                  checked={day.isAvailable}
                  onChange={(e) =>
                    updateDay(day.value, { is_available: e.target.checked })
                  }
                  className="w-5 h-5 rounded"
                />
                <span className="font-medium text-slate-900">{day.label}</span>
              </label>

              {day.isAvailable && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={day.startTime}
                    onChange={(e) =>
                      updateDay(day.value, { start_time: e.target.value })
                    }
                    className="px-3 py-1.5 border rounded-lg"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="time"
                    value={day.endTime}
                    onChange={(e) =>
                      updateDay(day.value, { end_time: e.target.value })
                    }
                    className="px-3 py-1.5 border rounded-lg"
                  />
                </div>
              )}

              {!day.isAvailable && (
                <span className="text-slate-500 text-sm">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Blackout Dates */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <RiCalendarLine className="w-5 h-5 text-violet-600" />
            Blackout Dates
          </h2>
          <AddBlackoutForm onAdd={addBlackout} />
        </div>

        {blackoutDates.length > 0 ? (
          <div className="space-y-2">
            {blackoutDates.map((blackout) => (
              <div
                key={blackout.id}
                className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {new Date(blackout.date + "T00:00:00").toLocaleDateString(
                      "en-US",
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      }
                    )}
                  </p>
                  {blackout.reason && (
                    <p className="text-sm text-slate-500">{blackout.reason}</p>
                  )}
                </div>
                <button
                  onClick={() => removeBlackout(blackout.id)}
                  className="p-2 text-red-600 hover:bg-red-100 rounded"
                >
                  <RiDeleteBinLine className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-4">
            No blackout dates set. Add dates when you&apos;re not available.
          </p>
        )}
      </div>
    </div>
  );
}

function AddBlackoutForm({
  onAdd,
}: {
  onAdd: (date: string, reason: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (date) {
      onAdd(date, reason);
      setDate("");
      setReason("");
      setShowForm(false);
    }
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50 rounded-lg"
      >
        <RiAddLine className="w-4 h-4" />
        Add Date
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        min={new Date().toISOString().split("T")[0]}
        className="px-3 py-1.5 border rounded-lg text-sm"
      />
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="px-3 py-1.5 border rounded-lg text-sm"
      />
      <button
        onClick={handleSubmit}
        disabled={!date}
        className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm disabled:opacity-50"
      >
        Add
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="p-1.5 text-slate-400 hover:text-slate-600"
      >
        <RiAddLine className="w-4 h-4 rotate-45" />
      </button>
    </div>
  );
}
