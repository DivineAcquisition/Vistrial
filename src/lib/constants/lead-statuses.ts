import type { LeadStatus } from "@/types/database"

export interface StatusConfig {
  label: string
  color: string
  bgColor: string
  description: string
  allowMessaging: boolean
}

export const LEAD_STATUSES: Record<LeadStatus, StatusConfig> = {
  new: {
    label: "New",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    description: "Just added, sequence not started",
    allowMessaging: true,
  },
  in_sequence: {
    label: "In Sequence",
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    description: "Actively being followed up",
    allowMessaging: true,
  },
  responded: {
    label: "Responded",
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    description: "Customer replied to a message",
    allowMessaging: true,
  },
  booked: {
    label: "Booked",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    description: "Converted to a job",
    allowMessaging: false,
  },
  not_interested: {
    label: "Not Interested",
    color: "text-gray-700 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-800",
    description: "Customer declined",
    allowMessaging: false,
  },
  no_response: {
    label: "No Response",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    description: "Sequence completed without response",
    allowMessaging: true,
  },
  paused: {
    label: "Paused",
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    description: "Sequence manually paused",
    allowMessaging: true,
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-500 dark:text-gray-500",
    bgColor: "bg-gray-50 dark:bg-gray-900",
    description: "Removed from sequence",
    allowMessaging: false,
  },
  opted_out: {
    label: "Opted Out",
    color: "text-rose-700 dark:text-rose-400",
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    description: "Customer requested no more messages (TCPA)",
    allowMessaging: false,
  },
}

export const ACTIVE_STATUSES: LeadStatus[] = ["new", "in_sequence", "paused"]
export const COMPLETED_STATUSES: LeadStatus[] = ["responded", "booked", "not_interested", "no_response", "cancelled", "opted_out"]
export const MESSAGEABLE_STATUSES: LeadStatus[] = ["new", "in_sequence", "responded", "no_response", "paused"]
export const NON_MESSAGEABLE_STATUSES: LeadStatus[] = ["booked", "not_interested", "cancelled", "opted_out"]
