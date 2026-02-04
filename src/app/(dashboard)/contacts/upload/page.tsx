/**
 * Contact Upload Page
 * 
 * This page handles CSV/Excel file uploads for bulk contact imports:
 * - Drag & drop file upload zone
 * - File validation (format, size limits)
 * - Column mapping interface
 * - Preview of data before import
 * - Import progress tracking
 * - Duplicate detection and handling options
 * - Error reporting for invalid rows
 */

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { 
  Upload, 
  FileSpreadsheet, 
  ArrowLeft, 
  CheckCircle2,
  X,
  Loader2
} from "lucide-react";

export default function ContactUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "mapping" | "uploading" | "complete" | "error">("idle");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.name.endsWith(".xlsx"))) {
      setFile(droppedFile);
      setUploadState("mapping");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadState("mapping");
    }
  }, []);

  // TODO: Implement with papaparse for CSV parsing
  // TODO: Implement column mapping logic
  // TODO: Call /api/contacts/upload endpoint

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Contacts
        </Link>
        <h1 className="text-2xl font-bold text-white">Import Contacts</h1>
        <p className="text-gray-400 mt-1">
          Upload a CSV or Excel file to import contacts into your database
        </p>
      </div>

      {/* Upload Zone */}
      {uploadState === "idle" && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-2xl p-12 text-center transition-all
            ${isDragging 
              ? "border-violet-500 bg-violet-500/10" 
              : "border-white/20 hover:border-white/40 bg-gray-900/50"
            }
          `}
        >
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="w-16 h-16 bg-violet-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-violet-400" />
          </div>
          <p className="text-white font-medium mb-2">
            Drag and drop your file here
          </p>
          <p className="text-gray-400 text-sm mb-4">
            or click to browse from your computer
          </p>
          <p className="text-gray-500 text-xs">
            Supports CSV and Excel files up to 10MB
          </p>
        </div>
      )}

      {/* File Selected - Column Mapping */}
      {uploadState === "mapping" && file && (
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-6">
          {/* File Info */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-gray-400 text-sm">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setUploadState("idle");
              }}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Column Mapping - Placeholder */}
          <div>
            <h3 className="text-white font-medium mb-4">Map Your Columns</h3>
            <p className="text-gray-400 text-sm mb-4">
              Match the columns from your file to contact fields
            </p>
            {/* TODO: Render actual column mapping interface */}
            <div className="space-y-3">
              {["First Name", "Last Name", "Phone", "Email", "Address"].map((field) => (
                <div key={field} className="flex items-center gap-4">
                  <span className="text-gray-300 w-32">{field}</span>
                  <select className="flex-1 px-3 py-2 bg-gray-800 border border-white/10 rounded-lg text-white">
                    <option value="">Select column...</option>
                    <option value="col_a">Column A</option>
                    <option value="col_b">Column B</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              onClick={() => {
                setFile(null);
                setUploadState("idle");
              }}
              className="px-4 py-2.5 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setUploadState("uploading")}
              className="px-6 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
            >
              Import Contacts
            </button>
          </div>
        </div>
      )}

      {/* Uploading State */}
      {uploadState === "uploading" && (
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-12 text-center">
          <Loader2 className="w-12 h-12 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Importing contacts...</p>
          <p className="text-gray-400 text-sm">This may take a moment</p>
        </div>
      )}

      {/* Complete State */}
      {uploadState === "complete" && (
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-12 text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <p className="text-white font-medium mb-2">Import Complete!</p>
          <p className="text-gray-400 text-sm mb-6">
            Successfully imported 0 contacts
          </p>
          <Link
            href="/contacts"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
          >
            View Contacts
          </Link>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <h4 className="text-blue-400 font-medium mb-2">Tips for successful imports</h4>
        <ul className="text-sm text-blue-300/80 space-y-1">
          <li>• Ensure phone numbers include country code (e.g., +1)</li>
          <li>• Remove duplicate entries before uploading</li>
          <li>• First row should contain column headers</li>
          <li>• Required fields: First Name, Phone Number</li>
        </ul>
      </div>
    </div>
  );
}
