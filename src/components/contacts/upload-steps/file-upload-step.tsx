// @ts-nocheck
'use client';

// ============================================
// FILE UPLOAD STEP
// Drag-and-drop file upload
// ============================================

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface FileUploadStepProps {
  onFileSelected: (file: File) => void;
}

export function FileUploadStep({ onFileSelected }: FileUploadStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors[0]?.code === 'file-too-large') {
          setError('File is too large. Maximum size is 10MB.');
        } else if (rejection.errors[0]?.code === 'file-invalid-type') {
          setError('Invalid file type. Please upload a CSV file.');
        } else {
          setError('Invalid file. Please upload a valid CSV file.');
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setSelectedFile(file);
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  return (
    <div className="space-y-6">
      <Card className="bg-gray-900/80 border-white/10">
        <CardContent className="pt-6">
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-white/20 hover:border-brand-500/50',
              error && 'border-red-500'
            )}
          >
            <input {...getInputProps()} />
            
            <div className="flex flex-col items-center">
              {selectedFile ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                  <p className="font-medium text-white">{selectedFile.name}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-4">
                    <Upload className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="font-medium text-white">
                    {isDragActive
                      ? 'Drop your file here'
                      : 'Drag and drop your CSV file here'}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    or click to browse
                  </p>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 mt-4 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-gray-900/80 border-white/10">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-white mb-4">CSV File Requirements</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <FileSpreadsheet className="h-4 w-4 mt-0.5 text-brand-400" />
              <span>
                File must be in CSV format with comma-separated values
              </span>
            </li>
            <li className="flex items-start gap-2">
              <FileSpreadsheet className="h-4 w-4 mt-0.5 text-brand-400" />
              <span>
                First row should contain column headers
              </span>
            </li>
            <li className="flex items-start gap-2">
              <FileSpreadsheet className="h-4 w-4 mt-0.5 text-brand-400" />
              <span>
                Each contact should have at least a name, email, or phone number
              </span>
            </li>
            <li className="flex items-start gap-2">
              <FileSpreadsheet className="h-4 w-4 mt-0.5 text-brand-400" />
              <span>
                Phone numbers should include country code (e.g., +1 for US)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <FileSpreadsheet className="h-4 w-4 mt-0.5 text-brand-400" />
              <span>
                Maximum file size: 10MB (approximately 100,000 contacts)
              </span>
            </li>
          </ul>

          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-white mb-2">Example CSV format:</p>
            <code className="text-xs text-gray-400">
              first_name,last_name,email,phone
              <br />
              John,Smith,john@example.com,+15551234567
              <br />
              Jane,Doe,jane@example.com,+15559876543
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
