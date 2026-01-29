import type { LeadStatus } from "@/types/database"

export interface StatusConfig {
  label: string
  color: string
  bgColor: string
  description: string
}

export const LEAD_STATUSES: Record<LeadStatus, StatusConfig> = {
  new: {
    label: "New",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    description: "Just added, sequence not started",
  },
  in_sequence: {
    label: "In Sequence",
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    description: "Actively being followed up",
  },
  responded: {
    label: "Responded",
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    description: "Customer replied to a message",
  },
  booked: {
    label: "Booked",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    description: "Converted to a job",
  },
  not_interested: {
    label: "Not Interested",
    color: "text-gray-700 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-800",
    description: "Customer declined",
  },
  no_response: {
    label: "No Response",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    description: "Sequence completed without response",
  },
  paused: {
    label: "Paused",
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    description: "Sequence manually paused",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-500 dark:text-gray-500",
    bgColor: "bg-gray-50 dark:bg-gray-900",
    description: "Removed from sequence",
  },
}

export const ACTIVE_STATUSES: LeadStatus[] = ["new", "in_sequence", "paused"]
export const COMPLETED_STATUSES: LeadStatus[] = ["responded", "booked", "not_interested", "no_response", "cancelled"]
