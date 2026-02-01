"use client"

import { cx } from "@/lib/utils"
import { RemixiconComponentType } from "@remixicon/react"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: RemixiconComponentType
  iconClassName?: string
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-50">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={cx(
            "rounded-lg p-3",
            iconClassName || "bg-brand-100 dark:bg-brand-950/30"
          )}
        >
          <Icon
            className={cx(
              "h-5 w-5",
              iconClassName
                ? "text-current"
                : "text-brand-600 dark:text-brand-400"
            )}
          />
        </div>
      </div>
    </div>
  )
}
