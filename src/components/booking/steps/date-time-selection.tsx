"use client";

import { useState, useMemo } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { BookingData } from "../booking-flow";

interface Availability {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface DateTimeSelectionProps {
  availability: Availability[];
  businessId: string;
  data: BookingData;
  updateData: (updates: Partial<BookingData>) => void;
  onNext: () => void;
  onBack: () => void;
  brandColor: string;
}

export function DateTimeSelection({
  availability,
  data,
  updateData,
  onNext,
  onBack,
  brandColor,
}: DateTimeSelectionProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add padding for days before month starts
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }

    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  }, [currentMonth]);

  // Get available days of week from availability settings
  const availableDaysOfWeek = useMemo(() => {
    return availability.map((a) => a.day_of_week);
  }, [availability]);

  // Check if a date is available
  const isDateAvailable = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Must be in the future (at least tomorrow)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date < tomorrow) return false;

    // Must be within 60 days
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 60);
    if (date > maxDate) return false;

    // Must be on an available day of week
    const dayOfWeek = date.getDay();
    if (availableDaysOfWeek.length > 0 && !availableDaysOfWeek.includes(dayOfWeek)) {
      return false;
    }

    return true;
  };

  // Generate time slots based on availability
  const timeSlots = useMemo(() => {
    if (!data.date) return [];

    const dayOfWeek = data.date.getDay();
    const dayAvailability = availability.find((a) => a.day_of_week === dayOfWeek);

    if (!dayAvailability) {
      // Default slots if no availability set
      return [
        { time: "08:00", label: "8:00 AM" },
        { time: "09:00", label: "9:00 AM" },
        { time: "10:00", label: "10:00 AM" },
        { time: "11:00", label: "11:00 AM" },
        { time: "13:00", label: "1:00 PM" },
        { time: "14:00", label: "2:00 PM" },
        { time: "15:00", label: "3:00 PM" },
        { time: "16:00", label: "4:00 PM" },
      ];
    }

    // Generate slots from availability
    const slots: { time: string; label: string }[] = [];
    const [startHour] = dayAvailability.start_time.split(":").map(Number);
    const [endHour] = dayAvailability.end_time.split(":").map(Number);

    for (let hour = startHour; hour < endHour; hour++) {
      const time = `${hour.toString().padStart(2, "0")}:00`;
      const hour12 = hour % 12 || 12;
      const ampm = hour >= 12 ? "PM" : "AM";
      slots.push({ time, label: `${hour12}:00 ${ampm}` });
    }

    return slots;
  }, [data.date, availability]);

  const canProceed = data.date && data.time;

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Choose Date & Time</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">When would you like us to come?</p>
      </div>

      {/* Calendar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RiArrowLeftSLine className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h3 className="font-semibold text-gray-900 dark:text-gray-50">
            {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h3>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RiArrowRightSLine className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date, i) => {
            if (!date) {
              return <div key={i} className="p-2" />;
            }

            const isAvailable = isDateAvailable(date);
            const isSelected =
              data.date && date.toDateString() === data.date.toDateString();

            return (
              <button
                key={i}
                onClick={() => isAvailable && updateData({ date, time: null })}
                disabled={!isAvailable}
                className={cn(
                  "p-2 text-sm rounded-lg transition-all",
                  isSelected
                    ? "text-white font-semibold"
                    : isAvailable
                    ? "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-50"
                    : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                )}
                style={isSelected ? { backgroundColor: brandColor } : {}}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Slots */}
      {data.date && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Available Times for{" "}
            {data.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {timeSlots.map((slot) => {
              const isSelected = data.time === slot.time;
              return (
                <button
                  key={slot.time}
                  onClick={() => updateData({ time: slot.time })}
                  className={cn(
                    "p-3 text-sm rounded-xl border transition-all",
                    isSelected
                      ? "text-white border-transparent"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-900"
                  )}
                  style={isSelected ? { backgroundColor: brandColor } : {}}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RiArrowLeftSLine className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: brandColor }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
