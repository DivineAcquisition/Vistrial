"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Checkbox } from "@/components/Checkbox"
import { Divider } from "@/components/Divider"
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
import {
  type BookingPageSettings,
  type ServiceAddon,
  defaultBookingPageSettings,
  defaultServiceAddons,
} from "@/data/booking-schema"
import {
  RiPaletteLine,
  RiLayoutLine,
  RiFileTextLine,
  RiSettings4Line,
  RiCalendarLine,
  RiPriceTag3Line,
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiExternalLinkLine,
} from "@remixicon/react"
import { useState } from "react"

// Color Input Component
function ColorInput({
  id,
  name,
  value,
  onChange,
  label,
}: {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div>
      <Label htmlFor={id} className="font-medium">
        {label}
      </Label>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded-md border border-gray-300 p-1 dark:border-gray-700"
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 font-mono text-sm"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}

// Section Header Component
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950">
        <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-gray-50">
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
    </div>
  )
}

export default function BookingSettings() {
  const [settings, setSettings] = useState<
    Omit<BookingPageSettings, "id" | "businessId" | "createdAt" | "updatedAt">
  >(defaultBookingPageSettings)

  const [addons] = useState<
    Omit<ServiceAddon, "id" | "businessId" | "createdAt" | "updatedAt">[]
  >(defaultServiceAddons)

  const updateSetting = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-10">
      {/* ========== BRANDING SECTION ========== */}
      <section aria-labelledby="branding-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiPaletteLine}
                title="Branding"
                description="Customize colors, logo, and typography to match your brand identity."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                {/* Colors */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Colors
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  <ColorInput
                    id="primary-color"
                    name="primaryColor"
                    value={settings.primaryColor}
                    onChange={(v) => updateSetting("primaryColor", v)}
                    label="Primary"
                  />
                  <ColorInput
                    id="secondary-color"
                    name="secondaryColor"
                    value={settings.secondaryColor}
                    onChange={(v) => updateSetting("secondaryColor", v)}
                    label="Secondary"
                  />
                  <ColorInput
                    id="accent-color"
                    name="accentColor"
                    value={settings.accentColor}
                    onChange={(v) => updateSetting("accentColor", v)}
                    label="Accent"
                  />
                  <ColorInput
                    id="background-color"
                    name="backgroundColor"
                    value={settings.backgroundColor}
                    onChange={(v) => updateSetting("backgroundColor", v)}
                    label="Background"
                  />
                  <ColorInput
                    id="card-bg-color"
                    name="cardBackgroundColor"
                    value={settings.cardBackgroundColor}
                    onChange={(v) => updateSetting("cardBackgroundColor", v)}
                    label="Card Background"
                  />
                  <ColorInput
                    id="text-color"
                    name="textColor"
                    value={settings.textColor}
                    onChange={(v) => updateSetting("textColor", v)}
                    label="Text"
                  />
                  <ColorInput
                    id="text-muted-color"
                    name="textMutedColor"
                    value={settings.textMutedColor}
                    onChange={(v) => updateSetting("textMutedColor", v)}
                    label="Muted Text"
                  />
                </div>

                <Divider className="my-6" />

                {/* Logo Settings */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Logo & Images
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="col-span-full">
                    <Label htmlFor="logo-url" className="font-medium">
                      Logo URL
                    </Label>
                    <Input
                      type="url"
                      id="logo-url"
                      name="logoUrl"
                      placeholder="https://example.com/logo.png"
                      value={settings.logoUrl || ""}
                      onChange={(e) =>
                        updateSetting("logoUrl", e.target.value || null)
                      }
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="logo-position" className="font-medium">
                      Logo Position
                    </Label>
                    <Select
                      value={settings.logoPosition}
                      onValueChange={(v) =>
                        updateSetting(
                          "logoPosition",
                          v as typeof settings.logoPosition
                        )
                      }
                    >
                      <SelectTrigger id="logo-position" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="logo-size" className="font-medium">
                      Logo Size
                    </Label>
                    <Select
                      value={settings.logoSize}
                      onValueChange={(v) =>
                        updateSetting("logoSize", v as typeof settings.logoSize)
                      }
                    >
                      <SelectTrigger id="logo-size" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-full">
                    <Label htmlFor="hero-image-url" className="font-medium">
                      Hero Image URL (Optional)
                    </Label>
                    <Input
                      type="url"
                      id="hero-image-url"
                      name="heroImageUrl"
                      placeholder="https://example.com/hero.jpg"
                      value={settings.heroImageUrl || ""}
                      onChange={(e) =>
                        updateSetting("heroImageUrl", e.target.value || null)
                      }
                      className="mt-2"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Optional header background image
                    </p>
                  </div>
                  <div className="col-span-full">
                    <Label htmlFor="favicon-url" className="font-medium">
                      Favicon URL
                    </Label>
                    <Input
                      type="url"
                      id="favicon-url"
                      name="faviconUrl"
                      placeholder="https://example.com/favicon.ico"
                      value={settings.faviconUrl || ""}
                      onChange={(e) =>
                        updateSetting("faviconUrl", e.target.value || null)
                      }
                      className="mt-2"
                    />
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Typography */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Typography
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="font-family" className="font-medium">
                      Font Family
                    </Label>
                    <Select
                      value={settings.fontFamily}
                      onValueChange={(v) => updateSetting("fontFamily", v)}
                    >
                      <SelectTrigger id="font-family" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Inter">Inter</SelectItem>
                        <SelectItem value="Roboto">Roboto</SelectItem>
                        <SelectItem value="Open Sans">Open Sans</SelectItem>
                        <SelectItem value="Lato">Lato</SelectItem>
                        <SelectItem value="Poppins">Poppins</SelectItem>
                        <SelectItem value="Montserrat">Montserrat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="heading-font" className="font-medium">
                      Heading Font (Optional)
                    </Label>
                    <Select
                      value={settings.headingFontFamily || "same"}
                      onValueChange={(v) =>
                        updateSetting(
                          "headingFontFamily",
                          v === "same" ? null : v
                        )
                      }
                    >
                      <SelectTrigger id="heading-font" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="same">Same as body</SelectItem>
                        <SelectItem value="Inter">Inter</SelectItem>
                        <SelectItem value="Roboto">Roboto</SelectItem>
                        <SelectItem value="Playfair Display">
                          Playfair Display
                        </SelectItem>
                        <SelectItem value="Merriweather">
                          Merriweather
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="font-size" className="font-medium">
                      Base Font Size
                    </Label>
                    <Select
                      value={settings.fontSizeBase}
                      onValueChange={(v) => updateSetting("fontSizeBase", v)}
                    >
                      <SelectTrigger id="font-size" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="14px">14px (Small)</SelectItem>
                        <SelectItem value="16px">16px (Default)</SelectItem>
                        <SelectItem value="18px">18px (Large)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Button Styles */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Button Styles
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="button-style" className="font-medium">
                      Button Style
                    </Label>
                    <Select
                      value={settings.buttonStyle}
                      onValueChange={(v) =>
                        updateSetting(
                          "buttonStyle",
                          v as typeof settings.buttonStyle
                        )
                      }
                    >
                      <SelectTrigger id="button-style" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rounded">Rounded</SelectItem>
                        <SelectItem value="pill">Pill</SelectItem>
                        <SelectItem value="square">Square</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="button-size" className="font-medium">
                      Button Size
                    </Label>
                    <Select
                      value={settings.buttonSize}
                      onValueChange={(v) =>
                        updateSetting(
                          "buttonSize",
                          v as typeof settings.buttonSize
                        )
                      }
                    >
                      <SelectTrigger id="button-size" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      <Divider />

      {/* ========== LAYOUT SECTION ========== */}
      <section aria-labelledby="layout-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiLayoutLine}
                title="Layout & Structure"
                description="Configure the overall layout, header, and footer of your booking page."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                {/* Layout Options */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Page Layout
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <Label htmlFor="layout-style" className="font-medium">
                      Layout Style
                    </Label>
                    <Select
                      value={settings.layoutStyle}
                      onValueChange={(v) =>
                        updateSetting(
                          "layoutStyle",
                          v as typeof settings.layoutStyle
                        )
                      }
                    >
                      <SelectTrigger id="layout-style" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="full-width">Full Width</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="progress-style" className="font-medium">
                      Progress Bar Style
                    </Label>
                    <Select
                      value={settings.progressBarStyle}
                      onValueChange={(v) =>
                        updateSetting(
                          "progressBarStyle",
                          v as typeof settings.progressBarStyle
                        )
                      }
                    >
                      <SelectTrigger id="progress-style" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="steps">Steps</SelectItem>
                        <SelectItem value="bar">Progress Bar</SelectItem>
                        <SelectItem value="dots">Dots</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="max-width" className="font-medium">
                      Max Width
                    </Label>
                    <Select
                      value={settings.maxWidth}
                      onValueChange={(v) => updateSetting("maxWidth", v)}
                    >
                      <SelectTrigger id="max-width" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="960px">960px (Narrow)</SelectItem>
                        <SelectItem value="1200px">1200px (Default)</SelectItem>
                        <SelectItem value="1400px">1400px (Wide)</SelectItem>
                        <SelectItem value="100%">Full Width</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-sidebar"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Show Sidebar Summary
                      </Label>
                      <p className="text-sm text-gray-500">
                        Display booking summary on the side
                      </p>
                    </div>
                    <Switch
                      id="show-sidebar"
                      checked={settings.showSidebarSummary}
                      onCheckedChange={(v) =>
                        updateSetting("showSidebarSummary", v)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="sidebar-position" className="font-medium">
                      Sidebar Position
                    </Label>
                    <Select
                      value={settings.sidebarPosition}
                      onValueChange={(v) =>
                        updateSetting(
                          "sidebarPosition",
                          v as typeof settings.sidebarPosition
                        )
                      }
                      disabled={!settings.showSidebarSummary}
                    >
                      <SelectTrigger id="sidebar-position" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Header Options */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Header
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="header-style" className="font-medium">
                      Header Style
                    </Label>
                    <Select
                      value={settings.headerStyle}
                      onValueChange={(v) =>
                        updateSetting(
                          "headerStyle",
                          v as typeof settings.headerStyle
                        )
                      }
                    >
                      <SelectTrigger id="header-style" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="colored">
                          Colored (Brand Color)
                        </SelectItem>
                        <SelectItem value="white">White</SelectItem>
                        <SelectItem value="transparent">Transparent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="header-tagline" className="font-medium">
                      Header Tagline
                    </Label>
                    <Input
                      type="text"
                      id="header-tagline"
                      placeholder="Book your cleaning in 60 seconds"
                      value={settings.headerTagline || ""}
                      onChange={(e) =>
                        updateSetting("headerTagline", e.target.value || null)
                      }
                      className="mt-2"
                    />
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="show-business-name"
                      checked={settings.showBusinessName}
                      onCheckedChange={(v) =>
                        updateSetting("showBusinessName", Boolean(v))
                      }
                    />
                    <Label htmlFor="show-business-name">
                      Show business name in header
                    </Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="show-business-phone"
                      checked={settings.showBusinessPhone}
                      onCheckedChange={(v) =>
                        updateSetting("showBusinessPhone", Boolean(v))
                      }
                    />
                    <Label htmlFor="show-business-phone">
                      Show phone number in header
                    </Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="show-business-email"
                      checked={settings.showBusinessEmail}
                      onCheckedChange={(v) =>
                        updateSetting("showBusinessEmail", Boolean(v))
                      }
                    />
                    <Label htmlFor="show-business-email">
                      Show email in header
                    </Label>
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Footer Options */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Footer
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-footer"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Show Footer
                      </Label>
                      <p className="text-sm text-gray-500">
                        Display footer at the bottom of the page
                      </p>
                    </div>
                    <Switch
                      id="show-footer"
                      checked={settings.showFooter}
                      onCheckedChange={(v) => updateSetting("showFooter", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-powered-by"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Show &quot;Powered By&quot; Badge
                      </Label>
                      <p className="text-sm text-gray-500">
                        Display attribution in footer
                      </p>
                    </div>
                    <Switch
                      id="show-powered-by"
                      checked={settings.showPoweredBy}
                      onCheckedChange={(v) => updateSetting("showPoweredBy", v)}
                      disabled={!settings.showFooter}
                    />
                  </div>
                  <div>
                    <Label htmlFor="footer-text" className="font-medium">
                      Custom Footer Text
                    </Label>
                    <Input
                      type="text"
                      id="footer-text"
                      placeholder="© 2024 Your Company. All rights reserved."
                      value={settings.footerText || ""}
                      onChange={(e) =>
                        updateSetting("footerText", e.target.value || null)
                      }
                      className="mt-2"
                      disabled={!settings.showFooter}
                    />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      <Divider />

      {/* ========== CONTENT/COPY SECTION ========== */}
      <section aria-labelledby="content-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiFileTextLine}
                title="Content & Copy"
                description="Customize headlines, descriptions, and messages displayed throughout the booking flow."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                {/* Step Headlines */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Step Headlines
                </h3>
                <div className="mt-4 space-y-6">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <div
                      key={step}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
                    >
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Step {step}
                      </h4>
                      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <Label
                            htmlFor={`step${step}-headline`}
                            className="font-medium"
                          >
                            Headline
                          </Label>
                          <Input
                            type="text"
                            id={`step${step}-headline`}
                            value={
                              settings[
                                `step${step}Headline` as keyof typeof settings
                              ] as string
                            }
                            onChange={(e) =>
                              updateSetting(
                                `step${step}Headline` as keyof typeof settings,
                                e.target.value as never
                              )
                            }
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor={`step${step}-subheadline`}
                            className="font-medium"
                          >
                            Subheadline
                          </Label>
                          <Input
                            type="text"
                            id={`step${step}-subheadline`}
                            value={
                              settings[
                                `step${step}Subheadline` as keyof typeof settings
                              ] as string
                            }
                            onChange={(e) =>
                              updateSetting(
                                `step${step}Subheadline` as keyof typeof settings,
                                e.target.value as never
                              )
                            }
                            className="mt-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Divider className="my-6" />

                {/* Confirmation Messages */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Confirmation Page
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label
                      htmlFor="confirmation-headline"
                      className="font-medium"
                    >
                      Headline
                    </Label>
                    <Input
                      type="text"
                      id="confirmation-headline"
                      value={settings.confirmationHeadline}
                      onChange={(e) =>
                        updateSetting("confirmationHeadline", e.target.value)
                      }
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="confirmation-subheadline"
                      className="font-medium"
                    >
                      Subheadline
                    </Label>
                    <Input
                      type="text"
                      id="confirmation-subheadline"
                      value={settings.confirmationSubheadline}
                      onChange={(e) =>
                        updateSetting("confirmationSubheadline", e.target.value)
                      }
                      className="mt-2"
                    />
                  </div>
                  <div className="col-span-full">
                    <Label
                      htmlFor="confirmation-message"
                      className="font-medium"
                    >
                      Additional Message (Optional)
                    </Label>
                    <Input
                      type="text"
                      id="confirmation-message"
                      placeholder="We'll send you a confirmation email shortly..."
                      value={settings.confirmationMessage || ""}
                      onChange={(e) =>
                        updateSetting(
                          "confirmationMessage",
                          e.target.value || null
                        )
                      }
                      className="mt-2"
                    />
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Error Messages */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Error Messages
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="service-area-error" className="font-medium">
                      Service Area Not Covered
                    </Label>
                    <Input
                      type="text"
                      id="service-area-error"
                      value={settings.serviceAreaErrorMessage}
                      onChange={(e) =>
                        updateSetting("serviceAreaErrorMessage", e.target.value)
                      }
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="no-availability" className="font-medium">
                      No Availability
                    </Label>
                    <Input
                      type="text"
                      id="no-availability"
                      value={settings.noAvailabilityMessage}
                      onChange={(e) =>
                        updateSetting("noAvailabilityMessage", e.target.value)
                      }
                      className="mt-2"
                    />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      <Divider />

      {/* ========== BEHAVIOR SECTION ========== */}
      <section aria-labelledby="behavior-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiSettings4Line}
                title="Behavior & Fields"
                description="Control which steps and fields appear in the booking flow."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                {/* Steps to Show */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Booking Steps
                </h3>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-zip"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        ZIP Code Validation
                      </Label>
                      <p className="text-sm text-gray-500">
                        Validate service area before booking
                      </p>
                    </div>
                    <Switch
                      id="show-zip"
                      checked={settings.showZipValidation}
                      onCheckedChange={(v) =>
                        updateSetting("showZipValidation", v)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-property"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Property Details Step
                      </Label>
                      <p className="text-sm text-gray-500">
                        Collect bedrooms, bathrooms, and property info
                      </p>
                    </div>
                    <Switch
                      id="show-property"
                      checked={settings.showPropertyStep}
                      onCheckedChange={(v) =>
                        updateSetting("showPropertyStep", v)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-frequency"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Frequency Selection
                      </Label>
                      <p className="text-sm text-gray-500">
                        Allow customers to choose recurring service
                      </p>
                    </div>
                    <Switch
                      id="show-frequency"
                      checked={settings.showFrequencySelection}
                      onCheckedChange={(v) =>
                        updateSetting("showFrequencySelection", v)
                      }
                    />
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Optional Fields */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Optional Fields
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="show-sqft"
                      checked={settings.showSqftField}
                      onCheckedChange={(v) =>
                        updateSetting("showSqftField", Boolean(v))
                      }
                    />
                    <Label htmlFor="show-sqft">Square footage field</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="show-pets"
                      checked={settings.showPetsField}
                      onCheckedChange={(v) =>
                        updateSetting("showPetsField", Boolean(v))
                      }
                    />
                    <Label htmlFor="show-pets">Pets field</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="show-property-type"
                      checked={settings.showPropertyTypeField}
                      onCheckedChange={(v) =>
                        updateSetting("showPropertyTypeField", Boolean(v))
                      }
                    />
                    <Label htmlFor="show-property-type">Property type</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="show-instructions"
                      checked={settings.showSpecialInstructions}
                      onCheckedChange={(v) =>
                        updateSetting("showSpecialInstructions", Boolean(v))
                      }
                    />
                    <Label htmlFor="show-instructions">
                      Special instructions
                    </Label>
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Required Fields */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Required Fields
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="require-email"
                      checked={settings.requireEmail}
                      onCheckedChange={(v) =>
                        updateSetting("requireEmail", Boolean(v))
                      }
                    />
                    <Label htmlFor="require-email">Require email address</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="require-address"
                      checked={settings.requireAddress}
                      onCheckedChange={(v) =>
                        updateSetting("requireAddress", Boolean(v))
                      }
                    />
                    <Label htmlFor="require-address">
                      Require full address
                    </Label>
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Default Values */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Default Values
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="default-bedrooms" className="font-medium">
                      Default Bedrooms
                    </Label>
                    <Input
                      type="number"
                      id="default-bedrooms"
                      min={1}
                      max={10}
                      value={settings.defaultBedrooms}
                      onChange={(e) =>
                        updateSetting(
                          "defaultBedrooms",
                          parseInt(e.target.value) || 1
                        )
                      }
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="default-bathrooms" className="font-medium">
                      Default Bathrooms
                    </Label>
                    <Input
                      type="number"
                      id="default-bathrooms"
                      min={1}
                      max={10}
                      step={0.5}
                      value={settings.defaultBathrooms}
                      onChange={(e) =>
                        updateSetting(
                          "defaultBathrooms",
                          parseFloat(e.target.value) || 1
                        )
                      }
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="default-frequency" className="font-medium">
                      Default Frequency
                    </Label>
                    <Select
                      value={settings.defaultFrequency}
                      onValueChange={(v) =>
                        updateSetting(
                          "defaultFrequency",
                          v as typeof settings.defaultFrequency
                        )
                      }
                    >
                      <SelectTrigger id="default-frequency" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_time">One-time</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      <Divider />

      {/* ========== SCHEDULING SECTION ========== */}
      <section aria-labelledby="scheduling-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiCalendarLine}
                title="Scheduling"
                description="Configure booking lead times, time slots, and availability settings."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                {/* Time Constraints */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Booking Window
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="min-lead-time" className="font-medium">
                      Minimum Lead Time (Hours)
                    </Label>
                    <Input
                      type="number"
                      id="min-lead-time"
                      min={0}
                      max={168}
                      value={settings.minLeadTimeHours}
                      onChange={(e) =>
                        updateSetting(
                          "minLeadTimeHours",
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="mt-2"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      How far in advance customers must book
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="max-days-ahead" className="font-medium">
                      Max Days Ahead
                    </Label>
                    <Input
                      type="number"
                      id="max-days-ahead"
                      min={1}
                      max={365}
                      value={settings.maxBookingDaysAhead}
                      onChange={(e) =>
                        updateSetting(
                          "maxBookingDaysAhead",
                          parseInt(e.target.value) || 30
                        )
                      }
                      className="mt-2"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      How far in future customers can book
                    </p>
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Time Slot Settings */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Time Slots
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="slot-interval" className="font-medium">
                      Time Slot Interval
                    </Label>
                    <Select
                      value={String(settings.timeSlotIntervalMinutes)}
                      onValueChange={(v) =>
                        updateSetting("timeSlotIntervalMinutes", parseInt(v))
                      }
                    >
                      <SelectTrigger id="slot-interval" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-duration"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Show Estimated Duration
                      </Label>
                      <p className="text-sm text-gray-500">
                        Display service duration estimate
                      </p>
                    </div>
                    <Switch
                      id="show-duration"
                      checked={settings.showEstimatedDuration}
                      onCheckedChange={(v) =>
                        updateSetting("showEstimatedDuration", v)
                      }
                    />
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Same-Day Booking */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Same-Day Booking
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="allow-same-day"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Allow Same-Day Booking
                      </Label>
                      <p className="text-sm text-gray-500">
                        Let customers book for today
                      </p>
                    </div>
                    <Switch
                      id="allow-same-day"
                      checked={settings.allowSameDayBooking}
                      onCheckedChange={(v) =>
                        updateSetting("allowSameDayBooking", v)
                      }
                    />
                  </div>
                  {settings.allowSameDayBooking && (
                    <div>
                      <Label
                        htmlFor="same-day-cutoff"
                        className="font-medium"
                      >
                        Same-Day Cutoff Hour
                      </Label>
                      <Select
                        value={String(settings.sameDayCutoffHour)}
                        onValueChange={(v) =>
                          updateSetting("sameDayCutoffHour", parseInt(v))
                        }
                      >
                        <SelectTrigger id="same-day-cutoff" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {i === 0
                                ? "12:00 AM"
                                : i < 12
                                  ? `${i}:00 AM`
                                  : i === 12
                                    ? "12:00 PM"
                                    : `${i - 12}:00 PM`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-gray-500">
                        Same-day booking not available after this time
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      <Divider />

      {/* ========== PRICING SECTION ========== */}
      <section aria-labelledby="pricing-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiPriceTag3Line}
                title="Pricing & Payment"
                description="Configure how prices are displayed and payment is collected."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                {/* Price Display */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Price Display
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label
                        htmlFor="price-display-format"
                        className="font-medium"
                      >
                        Price Display Format
                      </Label>
                      <Select
                        value={settings.priceDisplayFormat}
                        onValueChange={(v) =>
                          updateSetting(
                            "priceDisplayFormat",
                            v as typeof settings.priceDisplayFormat
                          )
                        }
                      >
                        <SelectTrigger id="price-display-format" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="from">
                            From $X (Starting price)
                          </SelectItem>
                          <SelectItem value="fixed">$X (Fixed price)</SelectItem>
                          <SelectItem value="range">
                            $X - $Y (Price range)
                          </SelectItem>
                          <SelectItem value="none">
                            Don&apos;t show prices
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="show-prices-services"
                        checked={settings.showPricesOnServices}
                        onCheckedChange={(v) =>
                          updateSetting("showPricesOnServices", Boolean(v))
                        }
                      />
                      <Label htmlFor="show-prices-services">
                        Show prices on service cards
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="show-price-breakdown"
                        checked={settings.showPriceBreakdown}
                        onCheckedChange={(v) =>
                          updateSetting("showPriceBreakdown", Boolean(v))
                        }
                      />
                      <Label htmlFor="show-price-breakdown">
                        Show price breakdown
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="show-price-flow"
                        checked={settings.showPriceDuringFlow}
                        onCheckedChange={(v) =>
                          updateSetting("showPriceDuringFlow", Boolean(v))
                        }
                      />
                      <Label htmlFor="show-price-flow">
                        Show price during booking flow
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="show-discount-badge"
                        checked={settings.showDiscountBadge}
                        onCheckedChange={(v) =>
                          updateSetting("showDiscountBadge", Boolean(v))
                        }
                      />
                      <Label htmlFor="show-discount-badge">
                        Show discount badges
                      </Label>
                    </div>
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Payment Settings */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Payment Collection
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="accept-payment"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Accept Payment at Booking
                      </Label>
                      <p className="text-sm text-gray-500">
                        Collect payment during the booking process
                      </p>
                    </div>
                    <Switch
                      id="accept-payment"
                      checked={settings.acceptPaymentAtBooking}
                      onCheckedChange={(v) =>
                        updateSetting("acceptPaymentAtBooking", v)
                      }
                    />
                  </div>

                  {settings.acceptPaymentAtBooking && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="deposit-type" className="font-medium">
                            Deposit Type
                          </Label>
                          <Select
                            value={settings.depositType}
                            onValueChange={(v) =>
                              updateSetting(
                                "depositType",
                                v as typeof settings.depositType
                              )
                            }
                          >
                            <SelectTrigger id="deposit-type" className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">
                                Percentage of total
                              </SelectItem>
                              <SelectItem value="fixed">Fixed amount</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {settings.depositType === "percentage" ? (
                          <div>
                            <Label
                              htmlFor="deposit-percentage"
                              className="font-medium"
                            >
                              Deposit Percentage
                            </Label>
                            <div className="mt-2 flex items-center gap-2">
                              <Input
                                type="number"
                                id="deposit-percentage"
                                min={0}
                                max={100}
                                value={settings.depositPercentage}
                                onChange={(e) =>
                                  updateSetting(
                                    "depositPercentage",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-24"
                              />
                              <span className="text-gray-500">%</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              0 = No deposit, 100 = Full payment
                            </p>
                          </div>
                        ) : (
                          <div>
                            <Label
                              htmlFor="deposit-amount"
                              className="font-medium"
                            >
                              Fixed Deposit Amount
                            </Label>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-gray-500">$</span>
                              <Input
                                type="number"
                                id="deposit-amount"
                                min={0}
                                step={0.01}
                                value={settings.depositFixedAmount || 0}
                                onChange={(e) =>
                                  updateSetting(
                                    "depositFixedAmount",
                                    parseFloat(e.target.value) || null
                                  )
                                }
                                className="w-32"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="show-deposit-explanation"
                          checked={settings.showDepositExplanation}
                          onCheckedChange={(v) =>
                            updateSetting("showDepositExplanation", Boolean(v))
                          }
                        />
                        <Label htmlFor="show-deposit-explanation">
                          Show deposit explanation to customers
                        </Label>
                      </div>
                    </>
                  )}
                </div>

                <Divider className="my-6" />

                {/* Recurring/Membership Settings */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Recurring Service Discounts
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="enable-recurring"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Enable Recurring Bookings
                      </Label>
                      <p className="text-sm text-gray-500">
                        Allow customers to schedule recurring services
                      </p>
                    </div>
                    <Switch
                      id="enable-recurring"
                      checked={settings.enableRecurring}
                      onCheckedChange={(v) =>
                        updateSetting("enableRecurring", v)
                      }
                    />
                  </div>

                  {settings.enableRecurring && (
                    <>
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                        <div>
                          <Label
                            htmlFor="default-recurring"
                            className="font-medium text-gray-900 dark:text-gray-50"
                          >
                            Default to Recurring
                          </Label>
                          <p className="text-sm text-gray-500">
                            Pre-select recurring option by default
                          </p>
                        </div>
                        <Switch
                          id="default-recurring"
                          checked={settings.defaultToRecurring}
                          onCheckedChange={(v) =>
                            updateSetting("defaultToRecurring", v)
                          }
                        />
                      </div>

                      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                          Recurring Discounts
                        </h4>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div>
                            <Label
                              htmlFor="discount-weekly"
                              className="text-sm text-gray-600 dark:text-gray-400"
                            >
                              Weekly
                            </Label>
                            <div className="mt-1 flex items-center gap-2">
                              <Input
                                type="number"
                                id="discount-weekly"
                                min={0}
                                max={50}
                                value={settings.recurringDiscountWeekly}
                                onChange={(e) =>
                                  updateSetting(
                                    "recurringDiscountWeekly",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-20"
                              />
                              <span className="text-gray-500">% off</span>
                            </div>
                          </div>
                          <div>
                            <Label
                              htmlFor="discount-biweekly"
                              className="text-sm text-gray-600 dark:text-gray-400"
                            >
                              Bi-weekly
                            </Label>
                            <div className="mt-1 flex items-center gap-2">
                              <Input
                                type="number"
                                id="discount-biweekly"
                                min={0}
                                max={50}
                                value={settings.recurringDiscountBiweekly}
                                onChange={(e) =>
                                  updateSetting(
                                    "recurringDiscountBiweekly",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-20"
                              />
                              <span className="text-gray-500">% off</span>
                            </div>
                          </div>
                          <div>
                            <Label
                              htmlFor="discount-monthly"
                              className="text-sm text-gray-600 dark:text-gray-400"
                            >
                              Monthly
                            </Label>
                            <div className="mt-1 flex items-center gap-2">
                              <Input
                                type="number"
                                id="discount-monthly"
                                min={0}
                                max={50}
                                value={settings.recurringDiscountMonthly}
                                onChange={(e) =>
                                  updateSetting(
                                    "recurringDiscountMonthly",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-20"
                              />
                              <span className="text-gray-500">% off</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="show-savings"
                          checked={settings.showRecurringSavings}
                          onCheckedChange={(v) =>
                            updateSetting("showRecurringSavings", Boolean(v))
                          }
                        />
                        <Label htmlFor="show-savings">
                          Show savings amount to customers
                        </Label>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <Label
                            htmlFor="badge-weekly"
                            className="font-medium"
                          >
                            Weekly Badge Text
                          </Label>
                          <Input
                            type="text"
                            id="badge-weekly"
                            value={settings.recurringBadgeTextWeekly}
                            onChange={(e) =>
                              updateSetting(
                                "recurringBadgeTextWeekly",
                                e.target.value
                              )
                            }
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor="badge-biweekly"
                            className="font-medium"
                          >
                            Bi-weekly Badge Text
                          </Label>
                          <Input
                            type="text"
                            id="badge-biweekly"
                            value={settings.recurringBadgeTextBiweekly}
                            onChange={(e) =>
                              updateSetting(
                                "recurringBadgeTextBiweekly",
                                e.target.value
                              )
                            }
                            className="mt-2"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      <Divider />

      {/* ========== ADD-ONS SECTION ========== */}
      <section aria-labelledby="addons-settings">
        <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
          <div>
            <SectionHeader
              icon={RiAddLine}
              title="Service Add-ons"
              description="Manage optional extras that customers can add to their booking."
            />
          </div>
          <div className="md:col-span-2">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <div>
                    <Label
                      htmlFor="enable-addons"
                      className="font-medium text-gray-900 dark:text-gray-50"
                    >
                      Enable Add-ons
                    </Label>
                    <p className="text-sm text-gray-500">
                      Show add-on options during booking
                    </p>
                  </div>
                  <Switch
                    id="enable-addons"
                    checked={settings.enableAddons}
                    onCheckedChange={(v) => updateSetting("enableAddons", v)}
                    className="ml-4"
                  />
                </div>
                <Button variant="secondary" disabled={!settings.enableAddons}>
                  <RiAddLine className="-ml-1 mr-1.5 h-4 w-4" />
                  Add New
                </Button>
              </div>

              {settings.enableAddons && (
                <div className="mt-6 space-y-3">
                  {addons.map((addon, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            addon.isPopular
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          <span className="text-lg">✨</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900 dark:text-gray-50">
                              {addon.name}
                            </h4>
                            {addon.isPopular && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                Popular
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">
                            {addon.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="font-medium text-gray-900 dark:text-gray-50">
                            ${addon.price}
                          </span>
                          <p className="text-xs text-gray-500">
                            {addon.priceType === "fixed"
                              ? "flat"
                              : addon.priceType === "per_room"
                                ? "/room"
                                : addon.priceType === "per_hour"
                                  ? "/hour"
                                  : "%"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <RiEditLine className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                          >
                            <RiDeleteBinLine className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </section>

      <Divider />

      {/* ========== SOCIAL PROOF & SEO SECTION ========== */}
      <section aria-labelledby="social-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiExternalLinkLine}
                title="Social Proof & SEO"
                description="Build trust with reviews and badges, and optimize for search engines."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                {/* Trust Badges */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Trust Badges
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-trust-badges"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Show Trust Badges
                      </Label>
                      <p className="text-sm text-gray-500">
                        Display credibility badges on booking page
                      </p>
                    </div>
                    <Switch
                      id="show-trust-badges"
                      checked={settings.showTrustBadges}
                      onCheckedChange={(v) =>
                        updateSetting("showTrustBadges", v)
                      }
                    />
                  </div>

                  {settings.showTrustBadges && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[
                        {
                          id: "satisfaction",
                          label: "Satisfaction Guaranteed",
                        },
                        { id: "insured", label: "Fully Insured" },
                        {
                          id: "background_checked",
                          label: "Background Checked",
                        },
                        { id: "eco_friendly", label: "Eco-Friendly" },
                        { id: "licensed", label: "Licensed" },
                      ].map((badge) => (
                        <div
                          key={badge.id}
                          className="flex items-center gap-3"
                        >
                          <Checkbox
                            id={`badge-${badge.id}`}
                            checked={settings.trustBadges.includes(
                              badge.id as typeof settings.trustBadges[number]
                            )}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                updateSetting("trustBadges", [
                                  ...settings.trustBadges,
                                  badge.id as typeof settings.trustBadges[number],
                                ])
                              } else {
                                updateSetting(
                                  "trustBadges",
                                  settings.trustBadges.filter(
                                    (b) => b !== badge.id
                                  )
                                )
                              }
                            }}
                          />
                          <Label htmlFor={`badge-${badge.id}`}>
                            {badge.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Divider className="my-6" />

                {/* Reviews */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Reviews
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="show-reviews"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Show Reviews
                      </Label>
                      <p className="text-sm text-gray-500">
                        Display customer reviews on booking page
                      </p>
                    </div>
                    <Switch
                      id="show-reviews"
                      checked={settings.showReviews}
                      onCheckedChange={(v) => updateSetting("showReviews", v)}
                    />
                  </div>
                  {settings.showReviews && (
                    <div>
                      <Label htmlFor="google-place-id" className="font-medium">
                        Google Place ID
                      </Label>
                      <Input
                        type="text"
                        id="google-place-id"
                        placeholder="ChIJ..."
                        value={settings.googleReviewsPlaceId || ""}
                        onChange={(e) =>
                          updateSetting(
                            "googleReviewsPlaceId",
                            e.target.value || null
                          )
                        }
                        className="mt-2"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Connect your Google Business reviews
                      </p>
                    </div>
                  )}
                </div>

                <Divider className="my-6" />

                {/* SEO */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  SEO Settings
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="meta-title" className="font-medium">
                      Meta Title
                    </Label>
                    <Input
                      type="text"
                      id="meta-title"
                      placeholder="Book Your Professional Cleaning Service"
                      value={settings.metaTitle || ""}
                      onChange={(e) =>
                        updateSetting("metaTitle", e.target.value || null)
                      }
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="meta-description" className="font-medium">
                      Meta Description
                    </Label>
                    <Input
                      type="text"
                      id="meta-description"
                      placeholder="Schedule your professional cleaning service in minutes..."
                      value={settings.metaDescription || ""}
                      onChange={(e) =>
                        updateSetting("metaDescription", e.target.value || null)
                      }
                      className="mt-2"
                    />
                  </div>
                </div>

                <Divider className="my-6" />

                {/* Analytics */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Analytics & Tracking
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ga-id" className="font-medium">
                      Google Analytics ID
                    </Label>
                    <Input
                      type="text"
                      id="ga-id"
                      placeholder="G-XXXXXXXXXX"
                      value={settings.googleAnalyticsId || ""}
                      onChange={(e) =>
                        updateSetting(
                          "googleAnalyticsId",
                          e.target.value || null
                        )
                      }
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fb-pixel" className="font-medium">
                      Facebook Pixel ID
                    </Label>
                    <Input
                      type="text"
                      id="fb-pixel"
                      placeholder="123456789012345"
                      value={settings.facebookPixelId || ""}
                      onChange={(e) =>
                        updateSetting(
                          "facebookPixelId",
                          e.target.value || null
                        )
                      }
                      className="mt-2"
                    />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      <Divider />

      {/* ========== NOTIFICATIONS SECTION ========== */}
      <section aria-labelledby="notification-settings">
        <form>
          <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-3">
            <div>
              <SectionHeader
                icon={RiSettings4Line}
                title="Notifications"
                description="Configure confirmation and reminder notifications for bookings."
              />
            </div>
            <div className="md:col-span-2">
              <Card className="p-6">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Confirmation Notifications
                </h3>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="confirm-email"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Send Confirmation Email
                      </Label>
                      <p className="text-sm text-gray-500">
                        Email customer when booking is confirmed
                      </p>
                    </div>
                    <Switch
                      id="confirm-email"
                      checked={settings.sendConfirmationEmail}
                      onCheckedChange={(v) =>
                        updateSetting("sendConfirmationEmail", v)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="confirm-sms"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Send Confirmation SMS
                      </Label>
                      <p className="text-sm text-gray-500">
                        Text customer when booking is confirmed
                      </p>
                    </div>
                    <Switch
                      id="confirm-sms"
                      checked={settings.sendConfirmationSms}
                      onCheckedChange={(v) =>
                        updateSetting("sendConfirmationSms", v)
                      }
                    />
                  </div>
                </div>

                <Divider className="my-6" />

                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Reminder Notifications
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div>
                      <Label
                        htmlFor="reminder-sms"
                        className="font-medium text-gray-900 dark:text-gray-50"
                      >
                        Send Reminder SMS
                      </Label>
                      <p className="text-sm text-gray-500">
                        Text customer before their appointment
                      </p>
                    </div>
                    <Switch
                      id="reminder-sms"
                      checked={settings.sendReminderSms}
                      onCheckedChange={(v) =>
                        updateSetting("sendReminderSms", v)
                      }
                    />
                  </div>
                  {settings.sendReminderSms && (
                    <div>
                      <Label htmlFor="reminder-hours" className="font-medium">
                        Reminder Time
                      </Label>
                      <Select
                        value={String(settings.reminderHoursBefore)}
                        onValueChange={(v) =>
                          updateSetting("reminderHoursBefore", parseInt(v))
                        }
                      >
                        <SelectTrigger id="reminder-hours" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 hours before</SelectItem>
                          <SelectItem value="4">4 hours before</SelectItem>
                          <SelectItem value="12">12 hours before</SelectItem>
                          <SelectItem value="24">24 hours before</SelectItem>
                          <SelectItem value="48">48 hours before</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </form>
      </section>

      {/* Save Button */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
        <Button variant="secondary">Cancel</Button>
        <Button>Save All Settings</Button>
      </div>
    </div>
  )
}
