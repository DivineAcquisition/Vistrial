"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { RiCheckboxCircleLine } from "@remixicon/react"

export default function TwilioSetup() {
  return (
    <>
      {/* Twilio Integration */}
      <Card>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
              Twilio Integration
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connect your Twilio account to send SMS
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <RiCheckboxCircleLine className="h-4 w-4" />
            Connected
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="account-sid" className="font-medium">
              Account SID
            </Label>
            <Input
              type="text"
              id="account-sid"
              defaultValue="AC••••••••••••••••••••••••••••1234"
              className="mt-1 bg-gray-50 dark:bg-gray-800"
              disabled
            />
          </div>
          <div>
            <Label htmlFor="phone-number" className="font-medium">
              Phone Number
            </Label>
            <Input
              type="text"
              id="phone-number"
              defaultValue="+1 (555) 987-6543"
              className="mt-1 bg-gray-50 dark:bg-gray-800"
              disabled
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-6 dark:border-gray-800">
          <Button variant="secondary" size="sm">
            Send Test SMS
          </Button>
          <button className="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-500">
            Disconnect
          </button>
        </div>
      </Card>
    </>
  )
}
