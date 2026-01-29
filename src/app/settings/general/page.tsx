"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"

export default function General() {
  return (
    <>
      {/* Profile Information */}
      <Card>
        <h3 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-50">
          Profile Information
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="business-name" className="font-medium">
                Business Name
              </Label>
              <Input
                type="text"
                id="business-name"
                defaultValue="Pro Plumbing Services"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="business-phone" className="font-medium">
                Business Phone
              </Label>
              <Input
                type="tel"
                id="business-phone"
                defaultValue="(555) 123-4567"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="email" className="font-medium">
              Email
            </Label>
            <Input
              type="email"
              id="email"
              defaultValue="malik@proplumbing.com"
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button>Save Changes</Button>
        </div>
      </Card>
    </>
  )
}
