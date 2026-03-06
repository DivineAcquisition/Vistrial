'use client';

// ============================================
// HERO ANIMATION
// Animated dashboard preview with effects
// ============================================

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  RiCheckLine,
  RiMessage2Line,
  RiPhoneLine,
  RiLineChartLine,
  RiNotification3Line,
} from '@remixicon/react';

export function HeroAnimation() {
  const [activeMessage, setActiveMessage] = useState(0);
  const [showNotification, setShowNotification] = useState(false);

  const messages = [
    {
      type: 'sent',
      text: "Hi Sarah! It's been a while since your last cleaning with Sparkle Maids. Ready to schedule your next appointment?",
      time: '10:32 AM',
    },
    {
      type: 'received',
      text: "Yes! I've been meaning to call. What's your availability next week?",
      time: '10:45 AM',
    },
    {
      type: 'sent',
      text: "Great to hear from you! We have Tuesday and Thursday open. Book here: sparkle.vistrial.link/book",
      time: '10:46 AM',
    },
  ];

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setActiveMessage((prev) => (prev + 1) % (messages.length + 1));
    }, 2000);

    const notificationInterval = setInterval(() => {
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    }, 8000);

    // Show initial notification after 2 seconds
    setTimeout(() => setShowNotification(true), 2000);
    setTimeout(() => setShowNotification(false), 5000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(notificationInterval);
    };
  }, [messages.length]);

  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Main Dashboard Preview */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-300/50">
        {/* Browser Chrome */}
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-yellow-400" />
            <div className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <div className="mx-4 flex-1">
            <div className="mx-auto max-w-md rounded-md border border-gray-200 bg-white px-3 py-1.5 text-center text-sm text-gray-500">
              app.vistrial.com/dashboard
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="bg-gray-50/50 p-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Stats Cards */}
            <div className="space-y-4 lg:col-span-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md animate-fade-in" style={{ animationDelay: '0.1s' }}>
                  <div className="mb-2 flex items-center gap-2 text-gray-500">
                    <RiMessage2Line className="h-4 w-4" />
                    <span className="text-xs">Messages Sent</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">2,847</p>
                  <p className="text-xs text-green-600">↑ 12% this week</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  <div className="mb-2 flex items-center gap-2 text-gray-500">
                    <RiLineChartLine className="h-4 w-4" />
                    <span className="text-xs">Response Rate</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">14.2%</p>
                  <p className="text-xs text-green-600">↑ 3.1% this week</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md animate-fade-in" style={{ animationDelay: '0.3s' }}>
                  <div className="mb-2 flex items-center gap-2 text-gray-500">
                    <RiCheckLine className="h-4 w-4" />
                    <span className="text-xs">Jobs Booked</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">47</p>
                  <p className="text-xs text-gray-500">$14,100 revenue</p>
                </div>
              </div>

              {/* Active Campaign */}
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">90-Day Reactivation</h3>
                    <p className="text-sm text-gray-500">847 contacts enrolled</p>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand-gradient transition-all duration-1000"
                    style={{ width: '68%' }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">576 of 847 contacts reached</p>
              </div>
            </div>

            {/* Conversation Preview */}
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm animate-fade-in" style={{ animationDelay: '0.5s' }}>
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">Recent Conversation</p>
              </div>
              <div className="min-h-[250px] space-y-3 p-4">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`transition-all duration-500 ${
                      index <= activeMessage ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                    }`}
                  >
                    <div
                      className={`rounded-lg p-3 text-sm ${
                        msg.type === 'sent'
                          ? 'ml-4 bg-brand-600 text-white'
                          : 'mr-4 bg-gray-100 text-gray-900'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <p
                      className={`mt-1 text-xs text-gray-500 ${
                        msg.type === 'sent' ? 'text-right' : ''
                      }`}
                    >
                      {msg.time}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Notification - New Booking */}
      <div
        className={`absolute -right-4 -top-4 rounded-xl border border-gray-200 bg-white p-3 shadow-lg transition-all duration-500 ${
          showNotification
            ? 'translate-y-0 opacity-100'
            : '-translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <RiCheckLine className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900">New Booking!</p>
            <p className="text-xs text-gray-500">Just now</p>
          </div>
        </div>
      </div>

      {/* Floating Element - Voice Drop */}
      <div className="absolute -bottom-4 -left-4 rounded-xl border border-gray-200 bg-white p-3 shadow-lg animate-bounce-slow">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100">
            <RiPhoneLine className="h-4 w-4 text-brand-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900">Voice Drop Delivered</p>
            <p className="text-xs text-gray-500">127 of 150</p>
          </div>
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute -bottom-10 -right-10 -z-10 h-40 w-40 rounded-full bg-brand-100/50 blur-3xl" />
      <div className="absolute -left-10 -top-10 -z-10 h-40 w-40 rounded-full bg-brand-200/30 blur-3xl" />
    </div>
  );
}
