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
      <div className="bg-white rounded-2xl shadow-2xl border overflow-hidden">
        {/* Browser Chrome */}
        <div className="bg-muted/50 px-4 py-3 border-b flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-background rounded-md px-3 py-1.5 text-sm text-muted-foreground max-w-md mx-auto">
              app.vistrial.com/dashboard
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-6 bg-muted/30">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Stats Cards */}
            <div className="lg:col-span-2 grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">Messages Sent</span>
                </div>
                <p className="text-2xl font-bold">2,847</p>
                <p className="text-xs text-green-600">↑ 12% this week</p>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Response Rate</span>
                </div>
                <p className="text-2xl font-bold">14.2%</p>
                <p className="text-xs text-green-600">↑ 3.1% this week</p>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-xs">Jobs Booked</span>
                </div>
                <p className="text-2xl font-bold">47</p>
                <p className="text-xs text-muted-foreground">$14,100 revenue</p>
              </div>

              {/* Active Campaign */}
              <div className="col-span-3 bg-white rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold">90-Day Reactivation</h3>
                    <p className="text-sm text-muted-foreground">847 contacts enrolled</p>
                  </div>
                  <Badge className="bg-green-100 text-green-700">Active</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                    style={{ width: '68%' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">576 of 847 contacts reached</p>
              </div>
            </div>

            {/* Conversation Preview */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30">
                <p className="font-medium text-sm">Recent Conversation</p>
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
                          ? 'bg-blue-600 text-white ml-4'
                          : 'bg-muted mr-4'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <p
                      className={`text-xs text-muted-foreground mt-1 ${
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
      <div className="absolute -top-4 -right-4 bg-white rounded-lg shadow-lg p-3 border animate-bounce-slow">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-medium">New Booking!</p>
            <p className="text-xs text-muted-foreground">Just now</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 -left-4 bg-white rounded-lg shadow-lg p-3 border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <Phone className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-medium">Voice Drop Delivered</p>
            <p className="text-xs text-muted-foreground">127 of 150</p>
          </div>
        </div>
      </div>
    </div>
  );
}
