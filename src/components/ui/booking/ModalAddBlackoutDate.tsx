"use client"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { Switch } from "@/components/Switch"
import { type BlackoutDateFormData } from "@/data/booking-schema"
import { RiAddLine } from "@remixicon/react"
import { useState } from "react"

const getDefaultDate = () => {
  const date = new Date()
  return date.toISOString().split("T")[0]
}

const defaultBlackoutDate: BlackoutDateFormData = {
  date: getDefaultDate(),
  reason: null,
  allDay: true,
  startTime: null,
  endTime: null,
}

interface ModalAddBlackoutDateProps {
  onSave: (blackoutDate: BlackoutDateFormData) => void
  editBlackoutDate?: BlackoutDateFormData | null
  trigger?: React.ReactNode
}

export function ModalAddBlackoutDate({
  onSave,
  editBlackoutDate,
  trigger,
}: ModalAddBlackoutDateProps) {
  const [open, setOpen] = useState(false)
  const [blackoutDate, setBlackoutDate] = useState<BlackoutDateFormData>(
    editBlackoutDate || defaultBlackoutDate
  )

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      setBlackoutDate(
        editBlackoutDate || { ...defaultBlackoutDate, date: getDefaultDate() }
      )
    }
  }

  const handleSave = () => {
    if (!blackoutDate.date) return
    onSave(blackoutDate)
    setOpen(false)
    setBlackoutDate(defaultBlackoutDate)
  }

  const updateBlackoutDate = <K extends keyof BlackoutDateFormData>(
    key: K,
    value: BlackoutDateFormData[K]
  ) => {
    setBlackoutDate((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="secondary">
            <RiAddLine className="-ml-1 mr-1.5 h-4 w-4" />
            Add Blackout Date
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editBlackoutDate ? "Edit Blackout Date" : "Add Blackout Date"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            {editBlackoutDate
              ? "Update the blackout date details below."
              : "Block a date when booking is not available."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          {/* Date */}
          <div>
            <Label htmlFor="blackout-date" className="font-medium">
              Date <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              id="blackout-date"
              value={blackoutDate.date}
              onChange={(e) => updateBlackoutDate("date", e.target.value)}
              className="mt-2"
            />
          </div>

          {/* Reason */}
          <div>
            <Label htmlFor="blackout-reason" className="font-medium">
              Reason
            </Label>
            <Input
              type="text"
              id="blackout-reason"
              value={blackoutDate.reason || ""}
              onChange={(e) =>
                updateBlackoutDate("reason", e.target.value || null)
              }
              placeholder="e.g., Holiday, Team Training"
              className="mt-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              Internal note (not shown to customers)
            </p>
          </div>

          {/* All Day Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div>
              <Label
                htmlFor="blackout-all-day"
                className="font-medium text-gray-900 dark:text-gray-50"
              >
                All Day
              </Label>
              <p className="text-sm text-gray-500">
                Block the entire day
              </p>
            </div>
            <Switch
              id="blackout-all-day"
              checked={blackoutDate.allDay}
              onCheckedChange={(v) => {
                updateBlackoutDate("allDay", v)
                if (v) {
                  updateBlackoutDate("startTime", null)
                  updateBlackoutDate("endTime", null)
                } else {
                  updateBlackoutDate("startTime", "09:00")
                  updateBlackoutDate("endTime", "17:00")
                }
              }}
            />
          </div>

          {/* Time Range (when not all day) */}
          {!blackoutDate.allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="blackout-start-time" className="font-medium">
                  Start Time
                </Label>
                <Input
                  type="time"
                  id="blackout-start-time"
                  value={blackoutDate.startTime || ""}
                  onChange={(e) =>
                    updateBlackoutDate("startTime", e.target.value || null)
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="blackout-end-time" className="font-medium">
                  End Time
                </Label>
                <Input
                  type="time"
                  id="blackout-end-time"
                  value={blackoutDate.endTime || ""}
                  onChange={(e) =>
                    updateBlackoutDate("endTime", e.target.value || null)
                  }
                  className="mt-2"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!blackoutDate.date}>
            {editBlackoutDate ? "Save Changes" : "Add Blackout Date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
