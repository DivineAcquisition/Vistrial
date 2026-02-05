// @ts-nocheck
'use client';

// ============================================
// WORKFLOW SETTINGS PANEL
// Send window and behavior configuration
// ============================================

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import type { WorkflowSettings } from '@/types/workflows';

interface WorkflowSettingsPanelProps {
  settings: WorkflowSettings;
  onChange: (settings: WorkflowSettings) => void;
}

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

export function WorkflowSettingsPanel({ settings, onChange }: WorkflowSettingsPanelProps) {
  const toggleDay = (day: string) => {
    const newDays = settings.send_days.includes(day as any)
      ? settings.send_days.filter((d) => d !== day)
      : [...settings.send_days, day as any];
    onChange({ ...settings, send_days: newDays });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Send Window</CardTitle>
          <CardDescription className="text-gray-400">
            Configure when messages can be sent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Time Window */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time" className="text-gray-300">Start Time</Label>
              <Input
                id="start_time"
                type="time"
                value={settings.send_window_start}
                onChange={(e) =>
                  onChange({ ...settings, send_window_start: e.target.value })
                }
                className="bg-gray-800 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time" className="text-gray-300">End Time</Label>
              <Input
                id="end_time"
                type="time"
                value={settings.send_window_end}
                onChange={(e) =>
                  onChange({ ...settings, send_window_end: e.target.value })
                }
                className="bg-gray-800 border-white/10 text-white"
              />
            </div>
          </div>

          {/* Days of Week */}
          <div className="space-y-3">
            <Label className="text-gray-300">Send Days</Label>
            <div className="flex flex-wrap gap-4">
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day.value}
                  className="flex items-center space-x-2"
                >
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={settings.send_days.includes(day.value as any)}
                    onCheckedChange={() => toggleDay(day.value)}
                    className="border-white/20"
                  />
                  <label
                    htmlFor={`day-${day.value}`}
                    className="text-sm cursor-pointer text-gray-300"
                  >
                    {day.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Timezone */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-300">Respect Contact Timezone</Label>
              <p className="text-sm text-gray-500">
                Send messages based on the contact&apos;s timezone if known
              </p>
            </div>
            <Switch
              checked={settings.respect_timezone}
              onCheckedChange={(checked) =>
                onChange({ ...settings, respect_timezone: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Behavior</CardTitle>
          <CardDescription className="text-gray-400">
            Configure how the workflow responds to actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-300">Stop on Response</Label>
              <p className="text-sm text-gray-500">
                Exit the workflow when a contact responds
              </p>
            </div>
            <Switch
              checked={settings.stop_on_response}
              onCheckedChange={(checked) =>
                onChange({ ...settings, stop_on_response: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-300">Stop on Booking</Label>
              <p className="text-sm text-gray-500">
                Exit the workflow when a contact books (if integrated)
              </p>
            </div>
            <Switch
              checked={settings.stop_on_booking}
              onCheckedChange={(checked) =>
                onChange({ ...settings, stop_on_booking: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
