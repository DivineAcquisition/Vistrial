/**
 * Settings Page (Main)
 * 
 * This is the main settings page that serves as a hub for all settings:
 * - General settings overview
 * - Quick links to sub-pages (billing, organization)
 * - Account preferences
 * - Notification settings
 * - API keys management
 * - Integration configurations
 */

import Link from "next/link";
import { 
  RiBankCardLine,
  RiBuilding2Line,
  RiNotification3Line,
  RiPlugLine,
  RiUserLine,
  RiShieldLine,
  RiArrowRightSLine,
  RiMessage2Line,
} from "@remixicon/react";

export const dynamic = "force-dynamic";

const settingsCategories = [
  {
    title: "Billing & Subscription",
    description: "Manage your plan, payment methods, and invoices",
    icon: RiBankCardLine,
    href: "/settings/billing",
    color: "brand",
  },
  {
    title: "Organization",
    description: "Company details, team members, and permissions",
    icon: RiBuilding2Line,
    href: "/settings/organization",
    color: "blue",
  },
  {
    title: "Notifications",
    description: "Email, SMS, and in-app notification preferences",
    icon: RiNotification3Line,
    href: "#notifications",
    color: "amber",
  },
  {
    title: "API & Integrations",
    description: "API keys, webhooks, and third-party connections",
    icon: RiPlugLine,
    href: "#integrations",
    color: "green",
  },
];

function SettingsCard({ 
  title, 
  description, 
  icon: Icon, 
  href, 
  color 
}: typeof settingsCategories[0]) {
  const colorClasses = {
    brand: "bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 group-hover:bg-brand-600 group-hover:text-white group-hover:ring-0",
    blue: "bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-600/10 group-hover:bg-blue-600 group-hover:text-white group-hover:ring-0",
    amber: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/10 group-hover:bg-amber-600 group-hover:text-white group-hover:ring-0",
    green: "bg-green-50 text-green-600 ring-1 ring-inset ring-green-600/10 group-hover:bg-green-600 group-hover:text-white group-hover:ring-0",
  };

  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl transition-colors ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <RiArrowRightSLine className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-2">{title}</h3>
      <p className="text-gray-500 text-sm">{description}</p>
    </Link>
  );
}

export default async function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">
          Manage your account and application preferences
        </p>
      </div>

      {/* Settings Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsCategories.map((category) => (
          <SettingsCard key={category.title} {...category} />
        ))}
      </div>

      {/* Account Settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
            <RiUserLine className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Account</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-gray-900 font-medium">Email</p>
              <p className="text-gray-500 text-sm">Your account email address</p>
            </div>
            <p className="text-gray-600">user@example.com</p>
          </div>
          
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-gray-900 font-medium">Password</p>
              <p className="text-gray-500 text-sm">Last changed never</p>
            </div>
            <button className="text-brand-600 hover:text-brand-700 font-medium text-sm">
              Change
            </button>
          </div>
          
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-gray-900 font-medium">Two-factor authentication</p>
              <p className="text-gray-500 text-sm">Add an extra layer of security</p>
            </div>
            <button className="text-brand-600 hover:text-brand-700 font-medium text-sm">
              Enable
            </button>
          </div>
        </div>
      </div>

      {/* Messaging Settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
            <RiMessage2Line className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Messaging Defaults</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-gray-900 font-medium">Default sender number</p>
              <p className="text-gray-500 text-sm">Phone number for outbound SMS</p>
            </div>
            <p className="text-gray-600">Not configured</p>
          </div>
          
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-gray-900 font-medium">Sending hours</p>
              <p className="text-gray-500 text-sm">Only send during business hours</p>
            </div>
            <p className="text-gray-600">9 AM - 8 PM</p>
          </div>
          
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-gray-900 font-medium">Timezone handling</p>
              <p className="text-gray-500 text-sm">Use contact&apos;s local timezone</p>
            </div>
            <button className="text-brand-600 hover:text-brand-700 font-medium text-sm">
              Configure
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-100 text-red-600">
            <RiShieldLine className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Danger Zone</h2>
        </div>
        <p className="text-gray-600 text-sm mb-4">
          Irreversible actions that affect your account
        </p>
        <button className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors">
          Delete Account
        </button>
      </div>
    </div>
  );
}
