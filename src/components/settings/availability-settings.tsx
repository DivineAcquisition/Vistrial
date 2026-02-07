// ============================================
// Availability management component
// ============================================

"use client";

import { useState } from "react";
import { Clock, Plus, Trash2, Calendar } from "lucide-react";

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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Availability
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Set your working hours and blackout dates
        </p>
      </div>

      {/* Weekly Schedule */}
      <div className="rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <Clock className="h-5 w-5 text-violet-600" />
          Weekly Schedule
        </h2>

        <div className="space-y-3">
          {scheduleByDay.map((day) => (
            <div
              key={day.value}
              className={`flex items-center gap-4 rounded-lg p-3 ${
                day.isAvailable
                  ? "bg-green-50 dark:bg-green-900/20"
                  : "bg-slate-50 dark:bg-slate-800"
              }`}
            >
              <label className="flex w-32 items-center gap-3">
                <input
                  type="checkbox"
                  checked={day.isAvailable}
                  onChange={(e) =>
                    updateDay(day.value, { is_available: e.target.checked })
                  }
                  className="h-5 w-5 rounded"
                />
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {day.label}
                </span>
              </label>

              {day.isAvailable && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={day.startTime}
                    onChange={(e) =>
                      updateDay(day.value, { start_time: e.target.value })
                    }
                    className="rounded-lg border px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <span className="text-slate-500 dark:text-slate-400">to</span>
                  <input
                    type="time"
                    value={day.endTime}
                    onChange={(e) =>
                      updateDay(day.value, { end_time: e.target.value })
                    }
                    className="rounded-lg border px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              )}

              {!day.isAvailable && (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Closed
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Blackout Dates */}
      <div className="rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Calendar className="h-5 w-5 text-violet-600" />
            Blackout Dates
          </h2>
          <AddBlackoutForm onAdd={addBlackout} />
        </div>

        {blackoutDates.length > 0 ? (
          <div className="space-y-2">
            {blackoutDates.map((blackout) => (
              <div
                key={blackout.id}
                className="flex items-center justify-between rounded-lg bg-red-50 p-3 dark:bg-red-900/20"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
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
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {blackout.reason}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeBlackout(blackout.id)}
                  className="rounded p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-slate-500 dark:text-slate-400">
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
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20"
      >
        <Plus className="h-4 w-4" />
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
        className="rounded-lg border px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
      />
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="rounded-lg border px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
      />
      <button
        onClick={handleSubmit}
        disabled={!date}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Add
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <Plus className="h-4 w-4 rotate-45" />
      </button>
    </div>
  );
}
