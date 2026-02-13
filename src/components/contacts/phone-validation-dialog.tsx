'use client';

// ============================================
// PHONE VALIDATION DIALOG
// Shows validation results after CSV upload
// ============================================

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Phone,
  Smartphone,
  PhoneOff,
  DollarSign,
} from 'lucide-react';

interface ValidationResult {
  phoneNumber: string;
  valid: boolean;
  canReceiveSMS: boolean;
  phoneType: 'mobile' | 'landline' | 'voip' | 'unknown';
  carrier: { name: string; type: string } | null;
  error?: string;
}

interface BulkValidationResult {
  total: number;
  valid: number;
  invalid: number;
  mobile: number;
  landline: number;
  voip: number;
  unknown: number;
  results: ValidationResult[];
  invalidNumbers: ValidationResult[];
  landlineNumbers: ValidationResult[];
}

interface PhoneValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumbers: string[];
  onComplete: (validNumbers: string[], excludedNumbers: string[]) => void;
}

export function PhoneValidationDialog({
  open,
  onOpenChange,
  phoneNumbers,
  onComplete,
}: PhoneValidationDialogProps) {
  const [status, setStatus] = useState<'idle' | 'estimating' | 'validating' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BulkValidationResult | null>(null);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [excludeLandlines, setExcludeLandlines] = useState(true);

  const uniqueCount = new Set(phoneNumbers).size;

  // Get cost estimate
  const fetchEstimate = async () => {
    setStatus('estimating');
    try {
      const response = await fetch(`/api/contacts/validate/estimate?count=${uniqueCount}`);
      const data = await response.json();
      setEstimatedCost(data.estimatedCost);
      setStatus('idle');
    } catch (error) {
      setEstimatedCost(uniqueCount * 0.015);
      setStatus('idle');
    }
  };

  // Run validation
  const runValidation = async () => {
    setStatus('validating');
    setProgress(0);

    try {
      const response = await fetch('/api/contacts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumbers }),
      });

      if (!response.ok) throw new Error('Validation failed');

      const data: BulkValidationResult = await response.json();
      setResult(data);
      setStatus('complete');
    } catch (error) {
      console.error('Validation error:', error);
      setStatus('idle');
    }
  };

  // Skip validation
  const skipValidation = () => {
    onComplete(phoneNumbers, []);
    onOpenChange(false);
  };

  // Complete with validated numbers
  const completeWithValidation = () => {
    if (!result) return;

    const validNumbers = result.results
      .filter((r) => {
        if (!r.valid) return false;
        if (!r.canReceiveSMS) return false;
        if (excludeLandlines && r.phoneType === 'landline') return false;
        return true;
      })
      .map((r) => r.phoneNumber);

    const excludedNumbers = result.results
      .filter((r) => !validNumbers.includes(r.phoneNumber))
      .map((r) => r.phoneNumber);

    onComplete(validNumbers, excludedNumbers);
    onOpenChange(false);
  };

  // Initialize estimate on open
  useEffect(() => {
    if (open && status === 'idle' && estimatedCost === 0) {
      fetchEstimate();
    }
    // Reset state when dialog closes
    if (!open) {
      setStatus('idle');
      setProgress(0);
      setResult(null);
      setEstimatedCost(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Validate Phone Numbers</DialogTitle>
          <DialogDescription>
            Check if phone numbers are valid and can receive SMS before importing
          </DialogDescription>
        </DialogHeader>

        {/* Idle State - Show Estimate */}
        {status === 'idle' && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Phone className="h-4 w-4" />
                  Total Numbers
                </div>
                <p className="text-2xl font-bold">{uniqueCount}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  Estimated Cost
                </div>
                <p className="text-2xl font-bold">${estimatedCost.toFixed(2)}</p>
              </div>
            </div>

            <div className="p-4 border rounded-lg space-y-3">
              <h4 className="font-medium">Why validate?</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  Identify invalid numbers before wasting SMS credits
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  Filter out landlines that can&apos;t receive SMS
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  Improve deliverability and campaign performance
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  See carrier information for each number
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Validating State */}
        {status === 'validating' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-medium">Validating phone numbers...</p>
              <p className="text-sm text-muted-foreground">
                This may take a minute for large lists
              </p>
            </div>
            <Progress value={progress} className="max-w-xs mx-auto" />
          </div>
        )}

        {/* Complete State - Show Results */}
        {status === 'complete' && result && (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                <Smartphone className="h-5 w-5 mx-auto text-green-600 mb-1" />
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{result.mobile}</p>
                <p className="text-xs text-green-600">Mobile</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                <Phone className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{result.voip}</p>
                <p className="text-xs text-blue-600">VoIP</p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-center">
                <PhoneOff className="h-5 w-5 mx-auto text-amber-600 mb-1" />
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{result.landline}</p>
                <p className="text-xs text-amber-600">Landline</p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-center">
                <XCircle className="h-5 w-5 mx-auto text-red-600 mb-1" />
                <p className="text-xl font-bold text-red-700 dark:text-red-400">{result.invalid}</p>
                <p className="text-xs text-red-600">Invalid</p>
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-4 bg-primary/5 rounded-lg">
              <p className="font-medium">
                {result.mobile + result.voip} numbers can receive SMS
              </p>
              {result.landline > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {result.landline} landlines will be excluded (can&apos;t receive SMS)
                </p>
              )}
              {result.invalid > 0 && (
                <p className="text-sm text-muted-foreground">
                  {result.invalid} invalid numbers will be excluded
                </p>
              )}
            </div>

            {/* Detailed Results */}
            <Tabs defaultValue="issues" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="issues">
                  Issues ({result.invalid + result.landline})
                </TabsTrigger>
                <TabsTrigger value="valid">
                  Valid ({result.mobile + result.voip})
                </TabsTrigger>
                <TabsTrigger value="all">
                  All ({result.total})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="issues">
                <ScrollArea className="h-[200px] border rounded-lg">
                  <div className="divide-y">
                    {[...result.invalidNumbers, ...result.landlineNumbers].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 text-sm">
                        <span className="font-mono">{item.phoneNumber}</span>
                        <Badge variant={item.valid ? 'secondary' : 'destructive'}>
                          {!item.valid ? 'Invalid' : 'Landline'}
                        </Badge>
                      </div>
                    ))}
                    {result.invalidNumbers.length === 0 && result.landlineNumbers.length === 0 && (
                      <div className="p-6 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        No issues found!
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="valid">
                <ScrollArea className="h-[200px] border rounded-lg">
                  <div className="divide-y">
                    {result.results
                      .filter((r) => r.valid && r.canReceiveSMS)
                      .map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 text-sm">
                          <div>
                            <span className="font-mono">{item.phoneNumber}</span>
                            {item.carrier && (
                              <span className="text-muted-foreground ml-2">
                                ({item.carrier.name})
                              </span>
                            )}
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {item.phoneType}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="all">
                <ScrollArea className="h-[200px] border rounded-lg">
                  <div className="divide-y">
                    {result.results.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <span className="font-mono">{item.phoneNumber}</span>
                          {item.carrier && (
                            <span className="text-muted-foreground ml-2">
                              ({item.carrier.name})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {item.phoneType}
                          </Badge>
                          {item.canReceiveSMS ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          {status === 'idle' && (
            <>
              <Button variant="outline" onClick={skipValidation}>
                Skip Validation
              </Button>
              <Button onClick={runValidation}>
                Validate Numbers (${estimatedCost.toFixed(2)})
              </Button>
            </>
          )}

          {status === 'complete' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={completeWithValidation}>
                Import {result ? result.mobile + result.voip : 0} Valid Numbers
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
