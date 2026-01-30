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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Switch } from "@/components/Switch"
import { Checkbox } from "@/components/Checkbox"
import { type ServiceAddonFormData, type AddonPriceType } from "@/data/booking-schema"
import { RiAddLine } from "@remixicon/react"
import { useState } from "react"

const defaultAddon: ServiceAddonFormData = {
  name: "",
  description: null,
  priceType: "fixed",
  price: 0,
  icon: null,
  displayOrder: 0,
  isActive: true,
  availableForServices: null,
  isPopular: false,
  maxQuantity: 1,
}

const iconOptions = [
  { value: "Refrigerator", label: "Refrigerator" },
  { value: "Flame", label: "Flame" },
  { value: "SquareStack", label: "Square Stack" },
  { value: "Shirt", label: "Shirt" },
  { value: "UtensilsCrossed", label: "Utensils" },
  { value: "AppWindow", label: "Window" },
  { value: "Warehouse", label: "Warehouse" },
  { value: "Sun", label: "Sun" },
  { value: "Sparkles", label: "Sparkles" },
  { value: "Bed", label: "Bed" },
  { value: "Bath", label: "Bath" },
  { value: "Car", label: "Car" },
  { value: "Dog", label: "Pet" },
]

interface ModalAddAddonProps {
  onSave: (addon: ServiceAddonFormData) => void
  editAddon?: ServiceAddonFormData | null
  trigger?: React.ReactNode
}

export function ModalAddAddon({
  onSave,
  editAddon,
  trigger,
}: ModalAddAddonProps) {
  const [open, setOpen] = useState(false)
  const [addon, setAddon] = useState<ServiceAddonFormData>(
    editAddon || defaultAddon
  )

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      setAddon(editAddon || defaultAddon)
    }
  }

  const handleSave = () => {
    if (!addon.name.trim()) return
    onSave(addon)
    setOpen(false)
    setAddon(defaultAddon)
  }

  const updateAddon = <K extends keyof ServiceAddonFormData>(
    key: K,
    value: ServiceAddonFormData[K]
  ) => {
    setAddon((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="secondary">
            <RiAddLine className="-ml-1 mr-1.5 h-4 w-4" />
            Add New Add-on
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editAddon ? "Edit Add-on" : "Add New Add-on"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            {editAddon
              ? "Update the add-on details below."
              : "Create a new optional extra that customers can add to their booking."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="addon-name" className="font-medium">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              id="addon-name"
              value={addon.name}
              onChange={(e) => updateAddon("name", e.target.value)}
              placeholder="e.g., Inside Fridge Cleaning"
              className="mt-2"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="addon-description" className="font-medium">
              Description
            </Label>
            <Input
              type="text"
              id="addon-description"
              value={addon.description || ""}
              onChange={(e) =>
                updateAddon("description", e.target.value || null)
              }
              placeholder="e.g., Deep clean inside refrigerator"
              className="mt-2"
            />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="addon-price-type" className="font-medium">
                Price Type
              </Label>
              <Select
                value={addon.priceType}
                onValueChange={(v) => updateAddon("priceType", v as AddonPriceType)}
              >
                <SelectTrigger id="addon-price-type" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Price</SelectItem>
                  <SelectItem value="per_room">Per Room</SelectItem>
                  <SelectItem value="per_hour">Per Hour</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="addon-price" className="font-medium">
                Price <span className="text-red-500">*</span>
              </Label>
              <div className="mt-2 flex items-center gap-2">
                {addon.priceType !== "percentage" && (
                  <span className="text-gray-500">$</span>
                )}
                <Input
                  type="number"
                  id="addon-price"
                  min={0}
                  step={addon.priceType === "percentage" ? 1 : 0.01}
                  value={addon.price}
                  onChange={(e) =>
                    updateAddon("price", parseFloat(e.target.value) || 0)
                  }
                  className="flex-1"
                />
                {addon.priceType === "percentage" && (
                  <span className="text-gray-500">%</span>
                )}
              </div>
            </div>
          </div>

          {/* Icon and Max Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="addon-icon" className="font-medium">
                Icon
              </Label>
              <Select
                value={addon.icon || "none"}
                onValueChange={(v) =>
                  updateAddon("icon", v === "none" ? null : v)
                }
              >
                <SelectTrigger id="addon-icon" className="mt-2">
                  <SelectValue placeholder="Select an icon" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Icon</SelectItem>
                  {iconOptions.map((icon) => (
                    <SelectItem key={icon.value} value={icon.value}>
                      {icon.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="addon-max-qty" className="font-medium">
                Max Quantity
              </Label>
              <Input
                type="number"
                id="addon-max-qty"
                min={1}
                max={99}
                value={addon.maxQuantity}
                onChange={(e) =>
                  updateAddon("maxQuantity", parseInt(e.target.value) || 1)
                }
                className="mt-2"
              />
            </div>
          </div>

          {/* Display Order */}
          <div>
            <Label htmlFor="addon-order" className="font-medium">
              Display Order
            </Label>
            <Input
              type="number"
              id="addon-order"
              min={0}
              value={addon.displayOrder}
              onChange={(e) =>
                updateAddon("displayOrder", parseInt(e.target.value) || 0)
              }
              className="mt-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              Lower numbers appear first
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <Label
                  htmlFor="addon-active"
                  className="font-medium text-gray-900 dark:text-gray-50"
                >
                  Active
                </Label>
                <p className="text-sm text-gray-500">
                  Show this add-on to customers
                </p>
              </div>
              <Switch
                id="addon-active"
                checked={addon.isActive}
                onCheckedChange={(v) => updateAddon("isActive", v)}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Checkbox
                id="addon-popular"
                checked={addon.isPopular}
                onCheckedChange={(v) => updateAddon("isPopular", Boolean(v))}
              />
              <Label htmlFor="addon-popular">
                Mark as popular (shows badge)
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!addon.name.trim()}>
            {editAddon ? "Save Changes" : "Add Add-on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
