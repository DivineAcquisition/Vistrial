/**
 * Loading Component
 * 
 * Reusable loading indicators:
 * - Spinner (default)
 * - Skeleton loader
 * - Full page loading overlay
 * - Button loading state
 * 
 * Variants: spinner, skeleton, overlay, inline
 */

"use client";

import { Loader2 } from "lucide-react";

interface LoadingProps {
  variant?: "spinner" | "skeleton" | "overlay" | "inline";
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export function Loading({ 
  variant = "spinner", 
  size = "md", 
  text,
  className = "" 
}: LoadingProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  if (variant === "overlay") {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm ${className}`}>
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4">
          <Loader2 className={`${sizeClasses.lg} text-brand-400 animate-spin`} />
          {text && <p className="text-gray-900 font-medium">{text}</p>}
        </div>
      </div>
    );
  }

  if (variant === "skeleton") {
    return (
      <div className={`animate-pulse bg-gray-800 rounded ${className}`} />
    );
  }

  if (variant === "inline") {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <Loader2 className={`${sizeClasses[size]} text-brand-400 animate-spin`} />
        {text && <span className="text-gray-400">{text}</span>}
      </span>
    );
  }

  // Default spinner
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className={`${sizeClasses[size]} text-brand-400 animate-spin`} />
      {text && <span className="ml-3 text-gray-400">{text}</span>}
    </div>
  );
}

// Skeleton variants
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white/80 rounded-2xl border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-gray-800 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-800 rounded w-1/3" />
          <div className="h-3 bg-gray-800 rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 bg-gray-800 rounded" />
        <div className="h-3 bg-gray-800 rounded w-4/5" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-12 bg-gray-800 rounded-t-xl mb-px" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-gray-800/50 mb-px" />
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i} 
          className="h-4 bg-gray-800 rounded" 
          style={{ width: i === lines - 1 ? "60%" : "100%" }} 
        />
      ))}
    </div>
  );
}
