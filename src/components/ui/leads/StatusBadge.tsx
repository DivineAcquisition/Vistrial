"use client"

import { cx } from "@/lib/utils"
import {
  RiAddLine,
  RiTimeLine,
  RiChat3Line,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiAlertLine,
  RiPauseCircleLine,
} from "@remixicon/react"

export type LeadStatus =
  | "new"
  | "in_sequence"
  | "responded"
  | "booked"
  | "not_interested"
  | "no_response"
  | "paused"

const statusConfig: Record<
  LeadStatus,
  {
    label: string
    color: string
    icon: typeof RiAddLine
  }
> = {
  new: {
    label: "New",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: RiAddLine,
  },
  in_sequence: {
    label: "In Sequence",
    color:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: RiTimeLine,
  },
  responded: {
    label: "Responded",
    color:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    icon: RiChat3Line,
  },
  booked: {
    label: "Booked",
    color:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: RiCheckboxCircleLine,
  },
  not_interested: {
    label: "Not Interested",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    icon: RiCloseCircleLine,
  },
  no_response: {
    label: "No Response",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: RiAlertLine,
  },
  paused: {
    label: "Paused",
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: RiPauseCircleLine,
  },
}

interface StatusBadgeProps {
  status: LeadStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.color
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  )
}
