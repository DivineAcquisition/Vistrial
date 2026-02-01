"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { RiBuilding2Line, RiPhoneLine, RiMailLine } from "@remixicon/react"

export default function General() {
  return (
    <>
      {/* Profile Information */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
        <Card className="relative">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400/20 to-brand-600/20">
              <RiBuilding2Line className="h-5 w-5 text-brand-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Profile Information
              </h3>
              <p className="text-sm text-gray-400">Update your business details</p>
            </div>
          </div>
          
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="business-name" className="font-medium text-gray-300 flex items-center gap-2 mb-2">
                  <RiBuilding2Line className="h-4 w-4 text-gray-500" />
                  Business Name
                </Label>
                <Input
                  type="text"
                  id="business-name"
                  defaultValue="Pro Plumbing Services"
                />
              </div>
              <div>
                <Label htmlFor="business-phone" className="font-medium text-gray-300 flex items-center gap-2 mb-2">
                  <RiPhoneLine className="h-4 w-4 text-gray-500" />
                  Business Phone
                </Label>
                <Input
                  type="tel"
                  id="business-phone"
                  defaultValue="(555) 123-4567"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="email" className="font-medium text-gray-300 flex items-center gap-2 mb-2">
                <RiMailLine className="h-4 w-4 text-gray-500" />
                Email
              </Label>
              <Input
                type="email"
                id="email"
                defaultValue="malik@proplumbing.com"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button>Save Changes</Button>
          </div>
        </Card>
      </div>
    </>
  )
}
