'use client';

// ============================================
// HERO ANIMATION
// Animated dashboard preview
// ============================================

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, MessageSquare, Phone, TrendingUp } from 'lucide-react';

export function HeroAnimation() {
  const [activeMessage, setActiveMessage] = useState(0);

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
    const interval = setInterval(() => {
      setActiveMessage((prev) => (prev + 1) % (messages.length + 1));
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="relative max-w-5xl mx-auto">
      {/* Main Dashboard Preview */}
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Browser Chrome */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-white rounded-md px-3 py-1.5 text-sm text-gray-500 max-w-md mx-auto border border-gray-200">
              app.vistrial.com/dashboard
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-6 bg-gray-50/50">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Stats Cards */}
            <div className="lg:col-span-2 grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">Messages Sent</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">2,847</p>
                <p className="text-xs text-green-600">↑ 12% this week</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Response Rate</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">14.2%</p>
                <p className="text-xs text-green-600">↑ 3.1% this week</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-xs">Jobs Booked</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">47</p>
                <p className="text-xs text-gray-500">$14,100 revenue</p>
              </div>

              {/* Active Campaign */}
              <div className="col-span-3 bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">90-Day Reactivation</h3>
                    <p className="text-sm text-gray-500">847 contacts enrolled</p>
                  </div>
                  <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-gradient rounded-full transition-all duration-1000"
                    style={{ width: '68%' }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">576 of 847 contacts reached</p>
              </div>
            </div>

            {/* Conversation Preview */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="font-medium text-sm text-gray-900">Recent Conversation</p>
              </div>
              <div className="p-4 space-y-3 min-h-[250px]">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`transition-all duration-500 ${
                      index <= activeMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`}
                  >
                    <div
                      className={`rounded-lg p-3 text-sm ${
                        msg.type === 'sent'
                          ? 'bg-brand-600 text-white ml-4'
                          : 'bg-gray-100 text-gray-900 mr-4'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <p
                      className={`text-xs text-gray-500 mt-1 ${
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

      {/* Floating Elements */}
      <div className="absolute -top-4 -right-4 bg-white rounded-lg shadow-lg p-3 border border-gray-100 animate-bounce-slow">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900">New Booking!</p>
            <p className="text-xs text-gray-500">Just now</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 -left-4 bg-white rounded-lg shadow-lg p-3 border border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
            <Phone className="h-4 w-4 text-brand-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900">Voice Drop Delivered</p>
            <p className="text-xs text-gray-500">127 of 150</p>
          </div>
        </div>
      </div>
    </div>
  );
}
