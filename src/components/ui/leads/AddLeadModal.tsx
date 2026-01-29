"use client"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { RiCloseLine, RiAddLine } from "@remixicon/react"
import { Checkbox } from "@/components/Checkbox"

interface AddLeadModalProps {
  onClose: () => void
}

export function AddLeadModal({ onClose }: AddLeadModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
            Add New Lead
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RiCloseLine className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name" className="font-medium">
                Name *
              </Label>
              <Input
                type="text"
                id="name"
                placeholder="John Smith"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="phone" className="font-medium">
                Phone *
              </Label>
              <Input
                type="tel"
                id="phone"
                placeholder="(555) 123-4567"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email" className="font-medium">
                Email
              </Label>
              <Input
                type="email"
                id="email"
                placeholder="john@email.com"
                className="mt-1"
              />
            </div>
          </div>

          {/* Quote */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quoteAmount" className="font-medium">
                Quote Amount
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  $
                </span>
                <Input
                  type="number"
                  id="quoteAmount"
                  placeholder="0.00"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="jobType" className="font-medium">
                Job Type
              </Label>
              <Select>
                <SelectTrigger id="jobType" className="mt-1">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="water-heater">Water Heater</SelectItem>
                  <SelectItem value="drain-cleaning">Drain Cleaning</SelectItem>
                  <SelectItem value="pipe-repair">Pipe Repair</SelectItem>
                  <SelectItem value="faucet-install">Faucet Install</SelectItem>
                  <SelectItem value="ac-install">AC Install</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sequence */}
          <div>
            <Label htmlFor="sequence" className="font-medium">
              Follow-Up Sequence
            </Label>
            <Select defaultValue="standard">
              <SelectTrigger id="sequence" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">
                  Standard Follow-Up (Default)
                </SelectItem>
                <SelectItem value="high-value">High-Value Quote</SelectItem>
                <SelectItem value="emergency">Emergency Service</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Start immediately */}
          <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-4 dark:bg-brand-950/20">
            <Checkbox id="startImmediately" defaultChecked />
            <label htmlFor="startImmediately" className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Start sequence immediately</span>
              <span className="block text-gray-500 dark:text-gray-400">
                First message will be sent right away
              </span>
            </label>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="font-medium">
              Notes
            </Label>
            <textarea
              id="notes"
              rows={2}
              placeholder="Any additional context..."
              className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-gray-800 dark:bg-gray-950 dark:focus:ring-brand-700/30"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 p-6 dark:border-gray-800">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="gap-2">
            <RiAddLine className="h-5 w-5" />
            Add Lead
          </Button>
        </div>
      </div>
    </div>
  )
}
