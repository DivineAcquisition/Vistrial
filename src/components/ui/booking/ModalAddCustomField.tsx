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
import {
  type CustomFieldFormData,
  type FieldType,
  type FieldWidth,
  type FieldOption,
} from "@/data/booking-schema"
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react"
import { useState } from "react"

const defaultField: CustomFieldFormData = {
  fieldKey: "",
  label: "",
  placeholder: null,
  helpText: null,
  fieldType: "text",
  options: null,
  isRequired: false,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  pattern: null,
  displayOrder: 0,
  showOnStep: 4,
  width: "full",
  showCondition: null,
  isActive: true,
}

const fieldTypeOptions: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Radio Buttons" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "file", label: "File Upload" },
]

interface ModalAddCustomFieldProps {
  onSave: (field: CustomFieldFormData) => void
  editField?: CustomFieldFormData | null
  trigger?: React.ReactNode
}

export function ModalAddCustomField({
  onSave,
  editField,
  trigger,
}: ModalAddCustomFieldProps) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<CustomFieldFormData>(
    editField || defaultField
  )
  const [options, setOptions] = useState<FieldOption[]>(
    editField?.options || []
  )

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      setField(editField || defaultField)
      setOptions(editField?.options || [])
    }
  }

  const handleSave = () => {
    if (!field.label.trim() || !field.fieldKey.trim()) return
    const fieldToSave: CustomFieldFormData = {
      ...field,
      options: needsOptions(field.fieldType) ? options : null,
    }
    onSave(fieldToSave)
    setOpen(false)
    setField(defaultField)
    setOptions([])
  }

  const updateField = <K extends keyof CustomFieldFormData>(
    key: K,
    value: CustomFieldFormData[K]
  ) => {
    setField((prev) => ({ ...prev, [key]: value }))
  }

  const needsOptions = (type: FieldType) =>
    ["select", "radio", "checkbox"].includes(type)

  const addOption = () => {
    setOptions((prev) => [...prev, { value: "", label: "" }])
  }

  const updateOption = (
    index: number,
    key: keyof FieldOption,
    value: string
  ) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, [key]: value } : opt))
    )
  }

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  const generateFieldKey = (label: string) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 50)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="secondary">
            <RiAddLine className="-ml-1 mr-1.5 h-4 w-4" />
            Add Custom Field
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editField ? "Edit Custom Field" : "Add Custom Field"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            {editField
              ? "Update the custom field details below."
              : "Create a custom question to collect additional information during booking."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          {/* Label */}
          <div>
            <Label htmlFor="field-label" className="font-medium">
              Label <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              id="field-label"
              value={field.label}
              onChange={(e) => {
                updateField("label", e.target.value)
                if (!editField) {
                  updateField("fieldKey", generateFieldKey(e.target.value))
                }
              }}
              placeholder="e.g., How did you hear about us?"
              className="mt-2"
            />
          </div>

          {/* Field Key */}
          <div>
            <Label htmlFor="field-key" className="font-medium">
              Field Key <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              id="field-key"
              value={field.fieldKey}
              onChange={(e) => updateField("fieldKey", e.target.value)}
              placeholder="e.g., referral_source"
              className="mt-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Internal identifier (no spaces, lowercase)
            </p>
          </div>

          {/* Field Type and Step */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="field-type" className="font-medium">
                Field Type
              </Label>
              <Select
                value={field.fieldType}
                onValueChange={(v) => updateField("fieldType", v as FieldType)}
              >
                <SelectTrigger id="field-type" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypeOptions.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="field-step" className="font-medium">
                Show on Step
              </Label>
              <Select
                value={String(field.showOnStep)}
                onValueChange={(v) => updateField("showOnStep", parseInt(v))}
              >
                <SelectTrigger id="field-step" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Step 1 - Service</SelectItem>
                  <SelectItem value="2">Step 2 - Property</SelectItem>
                  <SelectItem value="3">Step 3 - Schedule</SelectItem>
                  <SelectItem value="4">Step 4 - Contact</SelectItem>
                  <SelectItem value="5">Step 5 - Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Placeholder and Help Text */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="field-placeholder" className="font-medium">
                Placeholder
              </Label>
              <Input
                type="text"
                id="field-placeholder"
                value={field.placeholder || ""}
                onChange={(e) =>
                  updateField("placeholder", e.target.value || null)
                }
                placeholder="Enter placeholder text..."
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="field-width" className="font-medium">
                Width
              </Label>
              <Select
                value={field.width}
                onValueChange={(v) => updateField("width", v as FieldWidth)}
              >
                <SelectTrigger id="field-width" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Width</SelectItem>
                  <SelectItem value="half">Half Width</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="field-help" className="font-medium">
              Help Text
            </Label>
            <Input
              type="text"
              id="field-help"
              value={field.helpText || ""}
              onChange={(e) => updateField("helpText", e.target.value || null)}
              placeholder="Additional instructions for the customer..."
              className="mt-2"
            />
          </div>

          {/* Options for select/radio/checkbox */}
          {needsOptions(field.fieldType) && (
            <div>
              <Label className="font-medium">Options</Label>
              <div className="mt-2 space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={option.value}
                      onChange={(e) =>
                        updateOption(index, "value", e.target.value)
                      }
                      placeholder="Value"
                      className="flex-1 font-mono text-sm"
                    />
                    <Input
                      type="text"
                      value={option.label}
                      onChange={(e) =>
                        updateOption(index, "label", e.target.value)
                      }
                      placeholder="Label"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      className="h-10 w-10 shrink-0 p-0 text-red-500 hover:text-red-600"
                      onClick={() => removeOption(index)}
                    >
                      <RiDeleteBinLine className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={addOption}
                >
                  <RiAddLine className="-ml-1 mr-1.5 h-4 w-4" />
                  Add Option
                </Button>
              </div>
            </div>
          )}

          {/* Validation for text/number fields */}
          {["text", "textarea"].includes(field.fieldType) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="field-min-length" className="font-medium">
                  Min Length
                </Label>
                <Input
                  type="number"
                  id="field-min-length"
                  min={0}
                  value={field.minLength ?? ""}
                  onChange={(e) =>
                    updateField(
                      "minLength",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="field-max-length" className="font-medium">
                  Max Length
                </Label>
                <Input
                  type="number"
                  id="field-max-length"
                  min={0}
                  value={field.maxLength ?? ""}
                  onChange={(e) =>
                    updateField(
                      "maxLength",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {field.fieldType === "number" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="field-min-value" className="font-medium">
                  Min Value
                </Label>
                <Input
                  type="number"
                  id="field-min-value"
                  value={field.minValue ?? ""}
                  onChange={(e) =>
                    updateField(
                      "minValue",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="field-max-value" className="font-medium">
                  Max Value
                </Label>
                <Input
                  type="number"
                  id="field-max-value"
                  value={field.maxValue ?? ""}
                  onChange={(e) =>
                    updateField(
                      "maxValue",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {/* Display Order */}
          <div>
            <Label htmlFor="field-order" className="font-medium">
              Display Order
            </Label>
            <Input
              type="number"
              id="field-order"
              min={0}
              value={field.displayOrder}
              onChange={(e) =>
                updateField("displayOrder", parseInt(e.target.value) || 0)
              }
              className="mt-2"
            />
          </div>

          {/* Options */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <Label
                  htmlFor="field-active"
                  className="font-medium text-gray-900 dark:text-gray-50"
                >
                  Active
                </Label>
                <p className="text-sm text-gray-500">
                  Show this field to customers
                </p>
              </div>
              <Switch
                id="field-active"
                checked={field.isActive}
                onCheckedChange={(v) => updateField("isActive", v)}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Checkbox
                id="field-required"
                checked={field.isRequired}
                onCheckedChange={(v) => updateField("isRequired", Boolean(v))}
              />
              <Label htmlFor="field-required">Required field</Label>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={!field.label.trim() || !field.fieldKey.trim()}
          >
            {editField ? "Save Changes" : "Add Field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
