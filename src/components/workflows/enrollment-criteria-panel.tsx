// @ts-nocheck
'use client';

// ============================================
// ENROLLMENT CRITERIA PANEL
// Define who gets enrolled in the workflow
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
import type { EnrollmentCriteria } from '@/types/workflows';

interface EnrollmentCriteriaPanelProps {
  criteria: EnrollmentCriteria;
  onChange: (criteria: EnrollmentCriteria) => void;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export function EnrollmentCriteriaPanel({
  criteria,
  onChange,
}: EnrollmentCriteriaPanelProps) {
  const toggleStatus = (status: string) => {
    const current = criteria.status || [];
    const newStatuses = current.includes(status as any)
      ? current.filter((s) => s !== status)
      : [...current, status as any];
    onChange({ ...criteria, status: newStatuses });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Contact Criteria</CardTitle>
          <CardDescription className="text-gray-400">
            Define which contacts are eligible for this workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Filter */}
          <div className="space-y-3">
            <Label className="text-gray-300">Contact Status</Label>
            <div className="flex flex-wrap gap-4">
              {STATUS_OPTIONS.map((status) => (
                <div key={status.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status.value}`}
                    checked={criteria.status?.includes(status.value as any)}
                    onCheckedChange={() => toggleStatus(status.value)}
                    className="border-white/20"
                  />
                  <label
                    htmlFor={`status-${status.value}`}
                    className="text-sm cursor-pointer text-gray-300"
                  >
                    {status.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Recency Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="last_contacted" className="text-gray-300">Last Contacted</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">More than</span>
                <Input
                  id="last_contacted"
                  type="number"
                  min="0"
                  className="w-20 bg-gray-800 border-white/10 text-white"
                  value={criteria.last_contacted_before_days || ''}
                  onChange={(e) =>
                    onChange({
                      ...criteria,
                      last_contacted_before_days: parseInt(e.target.value) || undefined,
                    })
                  }
                />
                <span className="text-sm text-gray-500">days ago</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_job" className="text-gray-300">Last Job</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">More than</span>
                <Input
                  id="last_job"
                  type="number"
                  min="0"
                  className="w-20 bg-gray-800 border-white/10 text-white"
                  value={criteria.last_job_before_days || ''}
                  onChange={(e) =>
                    onChange({
                      ...criteria,
                      last_job_before_days: parseInt(e.target.value) || undefined,
                    })
                  }
                />
                <span className="text-sm text-gray-500">days ago</span>
              </div>
            </div>
          </div>

          {/* Contact Requirements */}
          <div className="space-y-4">
            <Label className="text-gray-300">Contact Requirements</Label>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Must have phone number</p>
                <p className="text-xs text-gray-500">
                  Required for SMS and voice messages
                </p>
              </div>
              <Switch
                checked={criteria.has_phone}
                onCheckedChange={(checked) =>
                  onChange({ ...criteria, has_phone: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Must have email</p>
                <p className="text-xs text-gray-500">
                  Required for email messages
                </p>
              </div>
              <Switch
                checked={criteria.has_email}
                onCheckedChange={(checked) =>
                  onChange({ ...criteria, has_email: checked })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Tag Filters</CardTitle>
          <CardDescription className="text-gray-400">
            Include or exclude contacts based on tags
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="include_tags" className="text-gray-300">Include Tags (any of)</Label>
            <Input
              id="include_tags"
              placeholder="Enter tags separated by commas"
              className="bg-gray-800 border-white/10 text-white"
              value={criteria.tags_include?.join(', ') || ''}
              onChange={(e) =>
                onChange({
                  ...criteria,
                  tags_include: e.target.value
                    ? e.target.value.split(',').map((t) => t.trim())
                    : undefined,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exclude_tags" className="text-gray-300">Exclude Tags</Label>
            <Input
              id="exclude_tags"
              placeholder="Enter tags separated by commas"
              className="bg-gray-800 border-white/10 text-white"
              value={criteria.tags_exclude?.join(', ') || ''}
              onChange={(e) =>
                onChange({
                  ...criteria,
                  tags_exclude: e.target.value
                    ? e.target.value.split(',').map((t) => t.trim())
                    : undefined,
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
