// @ts-nocheck
'use client';

// ============================================
// PREVIEW STEP
// Preview imported data and set options
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, CheckCircle, Users } from 'lucide-react';
import type { ParsedCsvData, ColumnMapping, ImportOptions } from '../csv-upload-wizard';

interface PreviewStepProps {
  data: ParsedCsvData;
  mapping: ColumnMapping;
  options: ImportOptions;
  onOptionsChange: (options: ImportOptions) => void;
  contactLimit: number;
}

export function PreviewStep({
  data,
  mapping,
  options,
  onOptionsChange,
  contactLimit,
}: PreviewStepProps) {
  // Get mapped field names
  const mappedFields = Object.entries(mapping)
    .filter(([_, value]) => value !== null)
    .map(([csvColumn, field]) => ({
      csvColumn,
      field: field as string,
    }));

  // Check if within contact limit
  const willExceedLimit = data.totalRows > contactLimit;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Import Summary</CardTitle>
          <CardDescription className="text-gray-400">
            Review the data before importing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <Users className="h-8 w-8 mx-auto mb-2 text-brand-400" />
              <p className="text-2xl font-bold text-white">{data.totalRows}</p>
              <p className="text-sm text-gray-400">Contacts to Import</p>
            </div>
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white">{mappedFields.length}</p>
              <p className="text-sm text-gray-400">Fields Mapped</p>
            </div>
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white">{contactLimit}</p>
              <p className="text-sm text-gray-400">Contact Limit</p>
            </div>
          </div>

          {willExceedLimit && (
            <div className="mt-4 p-4 bg-yellow-500/10 rounded-lg flex items-center gap-3 text-yellow-400">
              <AlertCircle className="h-5 w-5" />
              <span>
                This import will exceed your contact limit. Upgrade your plan or
                remove contacts before importing.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Preview */}
      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white">Data Preview</CardTitle>
          <CardDescription className="text-gray-400">
            First 5 rows of your import
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  {mappedFields.map(({ field }) => (
                    <TableHead key={field} className="capitalize text-gray-400">
                      {field.replace('_', ' ')}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.slice(0, 5).map((row, index) => (
                  <TableRow key={index} className="border-white/10 hover:bg-gray-800/50">
                    {mappedFields.map(({ csvColumn, field }) => (
                      <TableCell key={field} className="text-white">{row[csvColumn] || '-'}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Import Options */}
      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white">Import Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Duplicate Handling */}
          <div className="space-y-4">
            <Label className="text-gray-300">Duplicate Handling</Label>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Skip Duplicates</p>
                <p className="text-xs text-gray-500">
                  Skip contacts that already exist (by email or phone)
                </p>
              </div>
              <Switch
                checked={options.skipDuplicates}
                onCheckedChange={(checked) =>
                  onOptionsChange({
                    ...options,
                    skipDuplicates: checked,
                    updateExisting: checked ? options.updateExisting : false,
                  })
                }
              />
            </div>
            {options.skipDuplicates && (
              <div className="flex items-center justify-between ml-4">
                <div>
                  <p className="text-sm font-medium text-white">Update Existing</p>
                  <p className="text-xs text-gray-500">
                    Update existing contacts with new data
                  </p>
                </div>
                <Switch
                  checked={options.updateExisting}
                  onCheckedChange={(checked) =>
                    onOptionsChange({ ...options, updateExisting: checked })
                  }
                />
              </div>
            )}
          </div>

          {/* Default Tags */}
          <div className="space-y-2">
            <Label htmlFor="defaultTags" className="text-gray-300">Default Tags</Label>
            <Input
              id="defaultTags"
              placeholder="Enter tags separated by commas"
              className="bg-gray-800 border-white/10 text-white"
              value={options.defaultTags.join(', ')}
              onChange={(e) =>
                onOptionsChange({
                  ...options,
                  defaultTags: e.target.value
                    ? e.target.value.split(',').map((t) => t.trim())
                    : [],
                })
              }
            />
            <p className="text-xs text-gray-500">
              These tags will be added to all imported contacts
            </p>
          </div>

          {/* Source */}
          <div className="space-y-2">
            <Label htmlFor="source" className="text-gray-300">Source Label</Label>
            <Input
              id="source"
              placeholder="e.g., csv_import, marketing_list"
              className="bg-gray-800 border-white/10 text-white"
              value={options.source}
              onChange={(e) =>
                onOptionsChange({ ...options, source: e.target.value })
              }
            />
            <p className="text-xs text-gray-500">
              Helps you identify where these contacts came from
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ready to Import */}
      <div className="p-4 bg-green-500/10 rounded-lg flex items-center gap-3 text-green-400">
        <CheckCircle className="h-5 w-5" />
        <span>
          Ready to import {data.totalRows} contacts with {mappedFields.length}{' '}
          fields.
        </span>
      </div>
    </div>
  );
}
