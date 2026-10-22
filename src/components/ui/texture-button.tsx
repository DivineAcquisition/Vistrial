"use client"

import type * as React from "react"

import { Button, type ButtonProps, type ButtonVariant } from "@/components/ui/button"

/**
 * The texture button, drawn with Vistrial's own colours. Primary and accent
 * are the brand purple with near-black type. It is the same Button every
 * screen already uses, so the treatment stays in one place.
 */
const VARIANT: Record<
  "primary" | "secondary" | "accent" | "destructive" | "minimal" | "icon",
  ButtonVariant
> = {
  primary: "primary",
  accent: "gradient",
  destructive: "destructive",
  secondary: "secondary",
  minimal: "outline",
  icon: "outline",
}

export interface TextureButtonProps extends Omit<ButtonProps, "variant" | "size"> {
  variant?: keyof typeof VARIANT
  size?: "default" | "sm" | "lg" | "icon"
}

export function TextureButton({
  variant = "primary",
  size = "default",
  ...props
}: TextureButtonProps): React.ReactElement {
  const icon = variant === "icon" || size === "icon"
  return <Button variant={VARIANT[variant]} size={icon ? "icon" : size} {...props} />
}
