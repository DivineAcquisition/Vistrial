// @ts-nocheck
'use client';

// ============================================
// IMPORT PROGRESS STEP
// Shows import progress
// ============================================

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface ImportProgressStepProps {
  totalRows: number;
}

export function ImportProgressStep({ totalRows }: ImportProgressStepProps) {
  const [progress, setProgress] = useState(0);

  // Simulate progress (actual progress comes from polling in parent)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return prev;
        }
        return prev + Math.random() * 10;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-gray-900/80 border-white/10">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-brand-400 mb-6" />
          <h3 className="text-lg font-semibold text-white mb-2">Importing Contacts</h3>
          <p className="text-gray-400 mb-6">
            Please wait while we import your {totalRows} contacts...
          </p>
          <div className="w-full max-w-md">
            <Progress value={progress} className="h-2 bg-gray-800" />
            <p className="text-sm text-gray-500 text-center mt-2">
              {Math.round(progress)}% complete
            </p>
          </div>
          <p className="text-xs text-gray-500 mt-6">
            This may take a few minutes for large files
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
