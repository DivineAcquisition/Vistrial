'use client';

// ============================================
// WORKFLOW SETTINGS
// Configure workflow settings and enrollment criteria
// ============================================

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { WorkflowSettings as Settings, EnrollmentCriteria, DayOfWeek } from '@/types/workflows';

interface WorkflowSettingsProps {
  settings: Settings;
  criteria: EnrollmentCriteria;
  onSettingsChange: (settings: Settings) => void;
  onCriteriaChange: (criteria: EnrollmentCriteria) => void;
}

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

const TIMES = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
  '20:00', '21:00', '22:00',
];

export function WorkflowSettings({
  settings,
  criteria,
  onSettingsChange,
  onCriteriaChange,
}: WorkflowSettingsProps) {
  const toggleDay = (day: DayOfWeek) => {
    const newDays = settings.send_days.includes(day)
      ? settings.send_days.filter((d) => d !== day)
      : [...settings.send_days, day];
    onSettingsChange({ ...settings, send_days: newDays });
  };

  return (
    <div className="space-y-6">
      {/* Send Window */}
      <div className="space-y-3">
        <Label>Send Window</Label>
        <div className="flex items-center gap-2">
          <Select
            value={settings.send_window_start}
            onValueChange={(v) => onSettingsChange({ ...settings, send_window_start: v })}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMES.map((time) => (
                <SelectItem key={time} value={time}>
                  {time}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">to</span>
          <Select
            value={settings.send_window_end}
            onValueChange={(v) => onSettingsChange({ ...settings, send_window_end: v })}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMES.map((time) => (
                <SelectItem key={time} value={time}>
                  {time}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Messages will only be sent during this time window
        </p>
      </div>

      {/* Send Days */}
      <div className="space-y-3">
        <Label>Send Days</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <Badge
              key={day.key}
              variant={settings.send_days.includes(day.key) ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer',
                settings.send_days.includes(day.key) && 'bg-primary hover:bg-primary/90'
              )}
              onClick={() => toggleDay(day.key)}
            >
              {day.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Behavior Settings */}
      <div className="space-y-4">
        <Label>Behavior</Label>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Stop on response</p>
            <p className="text-xs text-muted-foreground">
              Stop the workflow when the contact replies
            </p>
          </div>
          <Switch
            checked={settings.stop_on_response}
            onCheckedChange={(v) => onSettingsChange({ ...settings, stop_on_response: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Stop on booking</p>
            <p className="text-xs text-muted-foreground">
              Stop when the contact books an appointment
            </p>
          </div>
          <Switch
            checked={settings.stop_on_booking}
            onCheckedChange={(v) => onSettingsChange({ ...settings, stop_on_booking: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Respect timezone</p>
            <p className="text-xs text-muted-foreground">
              Adjust send times to contact&apos;s timezone
            </p>
          </div>
          <Switch
            checked={settings.respect_timezone}
            onCheckedChange={(v) => onSettingsChange({ ...settings, respect_timezone: v })}
          />
        </div>
      </div>

      {/* Contact Requirements */}
      <div className="space-y-4">
        <Label>Contact Requirements</Label>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Must have phone</p>
            <p className="text-xs text-muted-foreground">
              Only enroll contacts with a phone number
            </p>
          </div>
          <Switch
            checked={criteria.has_phone || false}
            onCheckedChange={(v) => onCriteriaChange({ ...criteria, has_phone: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Must have email</p>
            <p className="text-xs text-muted-foreground">
              Only enroll contacts with an email address
            </p>
          </div>
          <Switch
            checked={criteria.has_email || false}
            onCheckedChange={(v) => onCriteriaChange({ ...criteria, has_email: v })}
          />
        </div>
      </div>
    </div>
  );
}
