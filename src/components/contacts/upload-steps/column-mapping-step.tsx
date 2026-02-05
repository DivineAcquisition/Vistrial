// @ts-nocheck
'use client';

// ============================================
// COLUMN MAPPING STEP
// Map CSV columns to contact fields
// ============================================

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import type { ColumnMapping } from '../csv-upload-wizard';

interface ColumnMappingStepProps {
  headers: string[];
  sampleRows: Record<string, string>[];
  mapping: ColumnMapping;
  suggestedMapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

const CONTACT_FIELDS = [
  { value: 'first_name', label: 'First Name', required: false },
  { value: 'last_name', label: 'Last Name', required: false },
  { value: 'email', label: 'Email', required: false },
  { value: 'phone', label: 'Phone', required: false },
  { value: 'address', label: 'Address', required: false },
  { value: 'city', label: 'City', required: false },
  { value: 'state', label: 'State', required: false },
  { value: 'zip', label: 'Zip Code', required: false },
  { value: 'notes', label: 'Notes', required: false },
  { value: 'tags', label: 'Tags', required: false },
  { value: 'source', label: 'Source', required: false },
];

export function ColumnMappingStep({
  headers,
  sampleRows,
  mapping,
  suggestedMapping,
  onChange,
}: ColumnMappingStepProps) {
  const handleMappingChange = (csvColumn: string, fieldValue: string) => {
    const newMapping = { ...mapping };

    // Clear any existing mapping to this field
    Object.keys(newMapping).forEach((key) => {
      if (newMapping[key] === fieldValue) {
        newMapping[key] = null;
      }
    });

    newMapping[csvColumn] = fieldValue === 'skip' ? null : fieldValue;
    onChange(newMapping);
  };

  const handleResetMapping = () => {
    onChange(suggestedMapping);
  };

  const mappedFields = Object.values(mapping).filter(Boolean);
  const hasRequiredField =
    mappedFields.includes('first_name') ||
    mappedFields.includes('email') ||
    mappedFields.includes('phone');

  return (
    <div className="space-y-6">
      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">Map Columns</CardTitle>
            <CardDescription className="text-gray-400">
              Match your CSV columns to contact fields
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleResetMapping}
            className="border-white/10 text-white hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Suggested
          </Button>
        </CardHeader>
        <CardContent>
          {/* Validation Message */}
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              hasRequiredField
                ? 'bg-green-500/10 text-green-400'
                : 'bg-yellow-500/10 text-yellow-400'
            }`}
          >
            {hasRequiredField ? (
              <>
                <CheckCircle className="h-5 w-5" />
                <span>
                  Mapping looks good! At least one identifying field is mapped.
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5" />
                <span>
                  Please map at least one of: First Name, Email, or Phone
                </span>
              </>
            )}
          </div>

          {/* Mapping Table */}
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    CSV Column
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Sample Data
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Map To
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {headers.map((header) => (
                  <tr key={header}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{header}</span>
                        {suggestedMapping[header] && (
                          <Badge variant="outline" className="text-xs border-violet-500/50 text-violet-400">
                            Suggested
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {sampleRows.slice(0, 2).map((row, i) => (
                        <div key={i} className="truncate max-w-[200px]">
                          {row[header] || '-'}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={mapping[header] || 'skip'}
                        onValueChange={(value) =>
                          handleMappingChange(header, value)
                        }
                      >
                        <SelectTrigger className="w-48 bg-gray-800 border-white/10 text-white">
                          <SelectValue placeholder="Skip this column" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-white/10">
                          <SelectItem value="skip" className="text-gray-400">
                            Skip this column
                          </SelectItem>
                          {CONTACT_FIELDS.map((field) => {
                            const isMapped =
                              Object.values(mapping).includes(field.value) &&
                              mapping[header] !== field.value;
                            return (
                              <SelectItem
                                key={field.value}
                                value={field.value}
                                disabled={isMapped}
                                className="text-white"
                              >
                                {field.label}
                                {isMapped && ' (already mapped)'}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mapped Fields Summary */}
      <Card className="bg-gray-900/80 border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white">Mapped Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CONTACT_FIELDS.filter((field) =>
              Object.values(mapping).includes(field.value)
            ).map((field) => (
              <Badge key={field.value} variant="secondary" className="bg-violet-600/20 text-violet-400">
                {field.label}
              </Badge>
            ))}
            {mappedFields.length === 0 && (
              <span className="text-sm text-gray-500">
                No fields mapped yet
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
