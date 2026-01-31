"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { RiCheckboxCircleLine, RiPhoneLine, RiKeyLine, RiMessageLine } from "@remixicon/react"

export default function TwilioSetup() {
  return (
    <>
      {/* Twilio Integration */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
        <Card className="relative">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400/20 to-brand-600/20">
                <RiMessageLine className="h-5 w-5 text-brand-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Twilio Integration
                </h3>
                <p className="text-sm text-gray-400">
                  Connect your Twilio account to send SMS
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1.5 text-sm font-medium text-green-400 border border-green-500/30">
              <RiCheckboxCircleLine className="h-4 w-4" />
              Connected
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <Label htmlFor="account-sid" className="font-medium text-gray-300 flex items-center gap-2 mb-2">
                <RiKeyLine className="h-4 w-4 text-gray-500" />
                Account SID
              </Label>
              <Input
                type="text"
                id="account-sid"
                defaultValue="AC••••••••••••••••••••••••••••1234"
                disabled
              />
            </div>
            <div>
              <Label htmlFor="phone-number" className="font-medium text-gray-300 flex items-center gap-2 mb-2">
                <RiPhoneLine className="h-4 w-4 text-gray-500" />
                Phone Number
              </Label>
              <Input
                type="text"
                id="phone-number"
                defaultValue="+1 (555) 987-6543"
                disabled
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-6">
            <Button variant="secondary" size="sm">
              Send Test SMS
            </Button>
            <button className="text-sm font-medium text-red-400 hover:text-red-300 transition-colors">
              Disconnect
            </button>
          </div>
        </Card>
      </div>
    </>
  )
}
