/**
 * Empty State Component
 * 
 * Displays when lists/tables have no data:
 * - Customizable icon
 * - Title and description
 * - Optional action button
 * - Various presets for common scenarios
 * 
 * Used throughout the application for empty data states
 */

"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { 
  Users, 
  Workflow, 
  MessageSquare, 
  FileSpreadsheet,
  Search,
  Inbox,
  Plus,
  Upload,
  LucideIcon
} from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: LucideIcon;
  };
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ 
  icon: Icon = Inbox, 
  title, 
  description, 
  action,
  children,
  className = "" 
}: EmptyStateProps) {
  const ActionIcon = action?.icon || Plus;

  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
        <Icon className="w-8 h-8 text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      {description && (
        <p className="text-gray-400 max-w-sm mx-auto mb-6">{description}</p>
      )}
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-colors"
          >
            <ActionIcon className="w-5 h-5" />
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-colors"
          >
            <ActionIcon className="w-5 h-5" />
            {action.label}
          </button>
        )
      )}
      {children}
    </div>
  );
}

// Preset empty states for common scenarios
export function EmptyContacts() {
  return (
    <EmptyState
      icon={Users}
      title="No contacts yet"
      description="Import your lead database to start running reactivation workflows"
      action={{
        label: "Import Contacts",
        href: "/contacts/upload",
        icon: Upload,
      }}
    />
  );
}

export function EmptyWorkflows() {
  return (
    <EmptyState
      icon={Workflow}
      title="No workflows created"
      description="Create your first workflow to automate lead reactivation"
      action={{
        label: "Create Workflow",
        href: "/workflows",
        icon: Plus,
      }}
    />
  );
}

export function EmptyMessages() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No messages yet"
      description="Messages will appear here once you start sending SMS or voice campaigns"
    />
  );
}

export function EmptySearchResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={`We couldn't find anything matching "${query}". Try adjusting your search.`}
    />
  );
}

export function EmptyInvoices() {
  return (
    <EmptyState
      icon={FileSpreadsheet}
      title="No invoices yet"
      description="Your invoices will appear here after your first billing cycle"
    />
  );
}
