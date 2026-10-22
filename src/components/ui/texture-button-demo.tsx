"use client"

import { ChevronLeft, Trash, X } from "lucide-react"

import { TextureButton } from "@/components/ui/texture-button"

export function TextureButtonDemo() {
  return (
    <div className="flex justify-center rounded-md bg-background px-4 py-6">
      <div>
        {(
          [
            ["primary", "Primary"],
            ["accent", "Accent"],
            ["secondary", "Secondary"],
            ["destructive", "Destructive"],
            ["minimal", "Minimal"],
          ] as const
        ).map(([variant, label]) => (
          <div key={variant} className="mt-4 flex max-w-lg gap-3">
            <TextureButton variant={variant} size="sm">
              {label}
            </TextureButton>
            <TextureButton variant={variant}>{label}</TextureButton>
          </div>
        ))}
        <div className="mt-4 flex max-w-xs gap-3">
          <TextureButton variant="icon" size="icon" aria-label="Back">
            <ChevronLeft />
          </TextureButton>
          <TextureButton variant="icon" size="icon" aria-label="Delete">
            <Trash />
          </TextureButton>
          <TextureButton variant="icon" size="icon" aria-label="Close">
            <X />
          </TextureButton>
        </div>
      </div>
    </div>
  )
}
