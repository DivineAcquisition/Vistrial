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
  CreditCard,
  Building2,
  Bell,
  Plug,
  User,
  Shield,
  ArrowRight,
  MessageSquare
} from "lucide-react";

export const dynamic = "force-dynamic";

const settingsCategories = [
  {
    title: "Billing & Subscription",
    description: "Manage your plan, payment methods, and invoices",
    icon: CreditCard,
    href: "/settings/billing",
    color: "violet",
  },
  {
    title: "Organization",
    description: "Company details, team members, and permissions",
    icon: Building2,
    href: "/settings/organization",
    color: "blue",
  },
  {
    title: "Notifications",
    description: "Email, SMS, and in-app notification preferences",
    icon: Bell,
    href: "#notifications",
    color: "amber",
  },
  {
    title: "API & Integrations",
    description: "API keys, webhooks, and third-party connections",
    icon: Plug,
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
    violet: "bg-violet-500/10 text-violet-400 group-hover:bg-violet-500",
    blue: "bg-blue-500/10 text-blue-400 group-hover:bg-blue-500",
    amber: "bg-amber-500/10 text-amber-400 group-hover:bg-amber-500",
    green: "bg-green-500/10 text-green-400 group-hover:bg-green-500",
  };

  return (
    <Link
      href={href}
      className="group bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all"
    >
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl ${colorClasses[color as keyof typeof colorClasses]} group-hover:text-white transition-colors`}>
          <Icon className="w-6 h-6" />
        </div>
        <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
      </div>
      <h3 className="text-lg font-semibold text-white mt-4 mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </Link>
  );
}

export default async function SettingsPage() {
  // TODO: Fetch user settings from database

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">
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
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-gray-500/10 text-gray-400">
            <User className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-white">Account</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div>
              <p className="text-white font-medium">Email</p>
              <p className="text-gray-400 text-sm">Your account email address</p>
            </div>
            <p className="text-gray-300">user@example.com</p>
          </div>
          
          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div>
              <p className="text-white font-medium">Password</p>
              <p className="text-gray-400 text-sm">Last changed never</p>
            </div>
            <button className="text-violet-400 hover:text-violet-300 font-medium text-sm">
              Change
            </button>
          </div>
          
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Two-factor authentication</p>
              <p className="text-gray-400 text-sm">Add an extra layer of security</p>
            </div>
            <button className="text-violet-400 hover:text-violet-300 font-medium text-sm">
              Enable
            </button>
          </div>
        </div>
      </div>

      {/* Messaging Settings */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-white">Messaging Defaults</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div>
              <p className="text-white font-medium">Default sender number</p>
              <p className="text-gray-400 text-sm">Phone number for outbound SMS</p>
            </div>
            <p className="text-gray-300">Not configured</p>
          </div>
          
          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div>
              <p className="text-white font-medium">Sending hours</p>
              <p className="text-gray-400 text-sm">Only send during business hours</p>
            </div>
            <p className="text-gray-300">9 AM - 8 PM</p>
          </div>
          
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Timezone handling</p>
              <p className="text-gray-400 text-sm">Use contact&apos;s local timezone</p>
            </div>
            <button className="text-violet-400 hover:text-violet-300 font-medium text-sm">
              Configure
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-white">Danger Zone</h2>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Irreversible actions that affect your account
        </p>
        <button className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg font-medium hover:bg-red-500/20 transition-colors">
          Delete Account
        </button>
      </div>
    </div>
  );
}
