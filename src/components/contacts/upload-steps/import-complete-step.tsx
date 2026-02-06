// @ts-nocheck
'use client';

// ============================================
// IMPORT COMPLETE STEP
// Shows import results
// ============================================

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  AlertCircle,
  Users,
  XCircle,
  Copy,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import type { ImportResult } from '../csv-upload-wizard';

interface ImportCompleteStepProps {
  result: ImportResult;
  onViewContacts: () => void;
  onImportMore: () => void;
}

export function ImportCompleteStep({
  result,
  onViewContacts,
  onImportMore,
}: ImportCompleteStepProps) {
  const isSuccess = result.successful > 0 && result.failed === 0;
  const isPartial = result.successful > 0 && result.failed > 0;
  const isFailed = result.successful === 0 && result.failed > 0;

  return (
    <Card className="bg-gray-900/80 border-white/10">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center py-8">
          {/* Status Icon */}
          {isSuccess && (
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          )}
          {isPartial && (
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mb-6">
              <AlertCircle className="h-8 w-8 text-yellow-400" />
            </div>
          )}
          {isFailed && (
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
              <XCircle className="h-8 w-8 text-red-400" />
            </div>
          )}

          {/* Title */}
          <h3 className="text-xl font-semibold text-white mb-2">
            {isSuccess && 'Import Complete!'}
            {isPartial && 'Import Completed with Issues'}
            {isFailed && 'Import Failed'}
          </h3>
          <p className="text-gray-400 mb-8">
            {isSuccess && `Successfully imported ${result.successful} contacts.`}
            {isPartial &&
              `Imported ${result.successful} contacts. ${result.failed} failed.`}
            {isFailed && 'No contacts were imported. Please check the errors below.'}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 w-full max-w-lg mb-8">
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white">
                {result.total}
              </p>
              <p className="text-xs text-gray-400">Total</p>
            </div>
            <div className="text-center p-4 bg-green-500/10 rounded-lg">
              <p className="text-2xl font-bold text-green-400">
                {result.successful}
              </p>
              <p className="text-xs text-gray-400">Imported</p>
            </div>
            <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
              <p className="text-2xl font-bold text-yellow-400">
                {result.duplicates}
              </p>
              <p className="text-xs text-gray-400">Duplicates</p>
            </div>
            <div className="text-center p-4 bg-red-500/10 rounded-lg">
              <p className="text-2xl font-bold text-red-400">{result.failed}</p>
              <p className="text-xs text-gray-400">Failed</p>
            </div>
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="w-full max-w-lg mb-8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-white">Errors ({result.errors.length})</p>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-white/10 rounded-lg">
                {result.errors.slice(0, 20).map((error, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 text-sm border-b border-white/10 last:border-b-0 flex items-start gap-2"
                  >
                    <span className="text-gray-500">Row {error.row}:</span>
                    <span className="text-red-400">{error.error}</span>
                  </div>
                ))}
                {result.errors.length > 20 && (
                  <div className="px-4 py-2 text-sm text-gray-500">
                    ... and {result.errors.length - 20} more errors
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <Button 
              variant="outline" 
              onClick={onImportMore}
              className="border-white/10 text-white hover:bg-gray-800"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Import More
            </Button>
            <Button onClick={onViewContacts} className="">
              <Users className="h-4 w-4 mr-2" />
              View Contacts
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
