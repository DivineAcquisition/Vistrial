// @ts-nocheck
'use client';

// ============================================
// CSV UPLOAD WIZARD
// Multi-step import process
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Upload, X } from 'lucide-react';
import { FileUploadStep } from './upload-steps/file-upload-step';
import { ColumnMappingStep } from './upload-steps/column-mapping-step';
import { PreviewStep } from './upload-steps/preview-step';
import { ImportProgressStep } from './upload-steps/import-progress-step';
import { ImportCompleteStep } from './upload-steps/import-complete-step';

interface CsvUploadWizardProps {
  organizationId: string;
  contactLimit: number;
}

export type WizardStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

export interface ParsedCsvData {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface ColumnMapping {
  [csvColumn: string]: string | null;
}

export interface ImportOptions {
  skipDuplicates: boolean;
  updateExisting: boolean;
  defaultTags: string[];
  source: string;
}

export interface ImportResult {
  total: number;
  successful: number;
  failed: number;
  duplicates: number;
  errors: Array<{ row: number; error: string }>;
}

export function CsvUploadWizard({
  organizationId,
  contactLimit,
}: CsvUploadWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedCsvData | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [suggestedMapping, setSuggestedMapping] = useState<ColumnMapping>({});
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    skipDuplicates: true,
    updateExisting: false,
    defaultTags: [],
    source: 'csv_import',
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);

  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);

    // Get preview from API
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/contacts/upload/preview', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse CSV');
      }

      setParsedData({
        headers: data.headers,
        rows: data.sample_rows,
        totalRows: data.total_rows,
      });
      setSuggestedMapping(data.suggested_mapping || {});
      setColumnMapping(data.suggested_mapping || {});
      setCurrentStep('mapping');
    } catch (error) {
      console.error('CSV parse error:', error);
      alert(error instanceof Error ? error.message : 'Failed to parse CSV file');
    }
  };

  const handleStartImport = async () => {
    if (!file || !parsedData) return;

    setCurrentStep('importing');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('column_mapping', JSON.stringify(columnMapping));
    formData.append('source', importOptions.source);
    formData.append('default_tags', importOptions.defaultTags.join(','));
    formData.append('skip_duplicates', importOptions.skipDuplicates.toString());
    formData.append('update_existing', importOptions.updateExisting.toString());

    try {
      const response = await fetch('/api/contacts/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportJobId(data.import_id);

      // Poll for completion
      pollImportStatus(data.import_id);
    } catch (error) {
      console.error('Import error:', error);
      setImportResult({
        total: parsedData.totalRows,
        successful: 0,
        failed: parsedData.totalRows,
        duplicates: 0,
        errors: [{ row: 0, error: error instanceof Error ? error.message : 'Import failed' }],
      });
      setCurrentStep('complete');
    }
  };

  const pollImportStatus = async (jobId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/contacts/imports/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed' || data.status === 'failed') {
          setImportResult({
            total: data.total_rows || 0,
            successful: data.successful_rows || 0,
            failed: data.failed_rows || 0,
            duplicates: data.duplicate_rows || 0,
            errors: data.errors || [],
          });
          setCurrentStep('complete');
        } else {
          // Keep polling
          setTimeout(checkStatus, 1000);
        }
      } catch (error) {
        console.error('Status check error:', error);
        setTimeout(checkStatus, 2000);
      }
    };

    checkStatus();
  };

  const handleCancel = () => {
    router.push('/contacts');
  };

  const handleBack = () => {
    switch (currentStep) {
      case 'mapping':
        setCurrentStep('upload');
        break;
      case 'preview':
        setCurrentStep('mapping');
        break;
    }
  };

  const handleNext = () => {
    switch (currentStep) {
      case 'mapping':
        setCurrentStep('preview');
        break;
      case 'preview':
        handleStartImport();
        break;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'upload':
        return !!file;
      case 'mapping':
        // At least first_name or email or phone must be mapped
        const mappedFields = Object.values(columnMapping).filter(Boolean);
        return (
          mappedFields.includes('first_name') ||
          mappedFields.includes('email') ||
          mappedFields.includes('phone')
        );
      case 'preview':
        return true;
      default:
        return false;
    }
  };

  const steps = [
    { id: 'upload', label: 'Upload File' },
    { id: 'mapping', label: 'Map Columns' },
    { id: 'preview', label: 'Preview' },
    { id: 'importing', label: 'Importing' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleCancel} className="text-gray-400 hover:text-white">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Upload className="h-6 w-6" />
              Import Contacts
            </h1>
            <p className="text-gray-400">
              Upload a CSV file to import contacts
            </p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      {currentStep !== 'complete' && (
        <div className="flex items-center justify-center">
          {steps.slice(0, -1).map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  index <= currentStepIndex
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                {index + 1}
              </div>
              <span
                className={`ml-2 text-sm ${
                  index <= currentStepIndex
                    ? 'text-white'
                    : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
              {index < steps.length - 2 && (
                <div
                  className={`w-12 h-1 mx-4 ${
                    index < currentStepIndex ? 'bg-brand-600' : 'bg-gray-800'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step Content */}
      <div className="min-h-[400px]">
        {currentStep === 'upload' && (
          <FileUploadStep onFileSelected={handleFileSelected} />
        )}

        {currentStep === 'mapping' && parsedData && (
          <ColumnMappingStep
            headers={parsedData.headers}
            sampleRows={parsedData.rows.slice(0, 3)}
            mapping={columnMapping}
            suggestedMapping={suggestedMapping}
            onChange={setColumnMapping}
          />
        )}

        {currentStep === 'preview' && parsedData && (
          <PreviewStep
            data={parsedData}
            mapping={columnMapping}
            options={importOptions}
            onOptionsChange={setImportOptions}
            contactLimit={contactLimit}
          />
        )}

        {currentStep === 'importing' && (
          <ImportProgressStep totalRows={parsedData?.totalRows || 0} />
        )}

        {currentStep === 'complete' && importResult && (
          <ImportCompleteStep
            result={importResult}
            onViewContacts={() => router.push('/contacts')}
            onImportMore={() => {
              setCurrentStep('upload');
              setFile(null);
              setParsedData(null);
              setColumnMapping({});
              setImportResult(null);
            }}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      {currentStep !== 'importing' && currentStep !== 'complete' && (
        <div className="flex justify-between pt-6 border-t border-white/10">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 'upload'}
            className="border-white/10 text-white hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={handleNext} 
            disabled={!canProceed()}
            className="bg-brand-600 hover:bg-brand-700"
          >
            {currentStep === 'preview' ? (
              <>
                Start Import
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
