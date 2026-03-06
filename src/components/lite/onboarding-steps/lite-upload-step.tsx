'use client';

// ============================================
// LITE UPLOAD STEP
// Simplified contact upload for onboarding
// ============================================

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RiUpload2Line,
  RiFileExcel2Line,
  RiCheckLine,
  RiArrowRightLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/hooks/use-toast';

interface LiteUploadStepProps {
  organizationId: string;
  onComplete: (contactCount: number) => void;
}

export function LiteUploadStep({
  organizationId,
  onComplete,
}: LiteUploadStepProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    count: number;
  } | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const selectedFile = acceptedFiles[0];
    setFile(selectedFile);
    setIsUploading(true);

    try {
      // First, preview the file
      const formData = new FormData();
      formData.append('file', selectedFile);

      const previewResponse = await fetch('/api/contacts/upload/preview', {
        method: 'POST',
        body: formData,
      });

      const previewData = await previewResponse.json();

      if (!previewResponse.ok) {
        throw new Error(previewData.error || 'Failed to parse file');
      }

      // Check contact limit (250 for Lite)
      if (previewData.total_rows > 250) {
        toast({
          title: 'Too many contacts',
          description: `Your file has ${previewData.total_rows} contacts. Lite plan supports up to 250. We'll import the first 250.`,
        });
      }

      // Auto-import with suggested mapping
      const importFormData = new FormData();
      importFormData.append('file', selectedFile);
      importFormData.append(
        'column_mapping',
        JSON.stringify(previewData.suggested_mapping || {})
      );
      importFormData.append('source', 'lite_onboarding');
      importFormData.append('skip_duplicates', 'true');

      const importResponse = await fetch('/api/contacts/upload', {
        method: 'POST',
        body: importFormData,
      });

      const importData = await importResponse.json();

      if (!importResponse.ok) {
        throw new Error(importData.error || 'Import failed');
      }

      // Poll for completion
      const checkStatus = async (jobId: string): Promise<number> => {
        const statusResponse = await fetch(`/api/contacts/imports/${jobId}`);
        const statusData = await statusResponse.json();

        if (statusData.status === 'completed') {
          return statusData.successful_rows || 0;
        } else if (statusData.status === 'failed') {
          throw new Error('Import failed');
        }

        // Keep polling
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return checkStatus(jobId);
      };

      const importedCount = await checkStatus(importData.import_id);

      setUploadResult({ success: true, count: importedCount });

      toast({
        title: 'Contacts imported!',
        description: `Successfully imported ${importedCount} contacts.`,
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
      setFile(null);
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
    disabled: isUploading,
  });

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload your customer list</h2>
        <p className="text-gray-600">
          Export from your CRM or just use a spreadsheet. We&apos;ll figure out the columns.
        </p>
      </div>

      {!uploadResult ? (
        <>
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-green-500 bg-green-50'
                : 'border-gray-300 hover:border-green-500/50 bg-gray-50',
              isUploading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <input {...getInputProps()} />

            <div className="flex flex-col items-center">
              {isUploading ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4 animate-pulse">
                    <RiUpload2Line className="h-6 w-6 text-green-600" />
                  </div>
                  <p className="font-medium text-gray-900">Importing contacts...</p>
                  <p className="text-sm text-gray-500 mt-1">
                    This usually takes a few seconds
                  </p>
                </>
              ) : file ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <RiFileExcel2Line className="h-6 w-6 text-green-600" />
                  </div>
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Drop a different file to replace
                  </p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <RiUpload2Line className="h-6 w-6 text-gray-500" />
                  </div>
                  <p className="font-medium text-gray-900">
                    {isDragActive ? 'Drop your file here' : 'Drag & drop your CSV file'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    or click to browse
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-900 mb-2">Your CSV should include:</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-gray-300 text-gray-600">First Name</Badge>
              <Badge variant="outline" className="border-gray-300 text-gray-600">Last Name</Badge>
              <Badge variant="outline" className="border-gray-300 text-gray-600">Phone Number</Badge>
              <Badge variant="secondary" className="text-gray-500">Email (optional)</Badge>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              We&apos;ll auto-detect your columns. Phone numbers should include country code (+1 for US).
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <RiCheckLine className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {uploadResult.count} contacts imported!
          </h3>
          <p className="text-gray-600 mb-6">
            Great! Now let&apos;s pick a campaign template.
          </p>
          <Button
            onClick={() => onComplete(uploadResult.count)}
            className="bg-green-600 hover:bg-green-700"
          >
            Continue
            <RiArrowRightLine className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
