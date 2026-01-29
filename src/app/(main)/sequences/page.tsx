"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Badge } from "@/components/Badge"
import {
  RiAddLine,
  RiChat3Line,
  RiMoreLine,
} from "@remixicon/react"

const sequences = [
  {
    id: 1,
    name: "Standard Follow-Up",
    steps: 3,
    isDefault: true,
    stats: { used: 89, responseRate: 42, bookingRate: 18 },
  },
  {
    id: 2,
    name: "High-Value Quote",
    steps: 5,
    isDefault: false,
    stats: { used: 34, responseRate: 52, bookingRate: 24 },
  },
  {
    id: 3,
    name: "Emergency Service",
    steps: 2,
    isDefault: false,
    stats: { used: 23, responseRate: 65, bookingRate: 45 },
  },
]

const sequenceSteps = [
  {
    step: 1,
    delay: "Immediately",
    message:
      "Hi {{first_name}}, this is {{business_name}}. Thanks for your interest! I wanted to confirm I sent over your quote for {{quote_amount}}. Any questions? Just reply here or call us anytime.",
  },
  {
    step: 2,
    delay: "3 days later",
    message:
      "Hey {{first_name}}, just checking in on the quote I sent over. Would love to get you scheduled. Still interested? Let me know!",
  },
  {
    step: 3,
    delay: "4 days later",
    message:
      'Hi {{first_name}}, final follow-up on your quote. If you\'re ready to move forward, just reply "YES" and I\'ll call to schedule. If timing isn\'t right, no worries - we\'re here when you need us!',
  },
]

export default function SequencesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Sequences
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Automated follow-up templates
          </p>
        </div>
        <Button className="gap-2">
          <RiAddLine className="h-5 w-5" />
          New Sequence
        </Button>
      </div>

      {/* Sequences Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sequences.map((sequence) => (
          <Card key={sequence.id}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                    {sequence.name}
                  </h3>
                  {sequence.isDefault && (
                    <Badge variant="default">Default</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {sequence.steps} steps
                </p>
              </div>
              <button className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
                <RiMoreLine className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Steps Preview */}
            <div className="mb-6 flex items-center gap-2">
              {[...Array(sequence.steps)].map((_, i) => (
                <div key={i} className="flex items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950/30">
                    <RiChat3Line className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  </div>
                  {i < sequence.steps - 1 && (
                    <div className="h-0.5 w-4 bg-gray-200 dark:bg-gray-700" />
                  )}
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 border-t border-gray-200 pt-4 dark:border-gray-800">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-50">
                  {sequence.stats.used}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Used</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {sequence.stats.responseRate}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Response
                </p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {sequence.stats.bookingRate}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Booking
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1">
                Edit
              </Button>
              <Button className="flex-1">View Steps</Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Sequence Builder Preview */}
      <Card>
        <h3 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-50">
          Standard Follow-Up Steps
        </h3>

        <div className="space-y-4">
          {sequenceSteps.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-medium text-white">
                  {step.step}
                </div>
                {i < sequenceSteps.length - 1 && (
                  <div className="my-2 w-0.5 flex-1 bg-gray-200 dark:bg-gray-700" />
                )}
              </div>
              <div className="flex-1 pb-6">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                    Step {step.step}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    • {step.delay}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {step.message}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
