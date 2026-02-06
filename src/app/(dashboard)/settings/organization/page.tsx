/**
 * Organization Settings Page
 * 
 * This page manages organization/company settings:
 * - Business profile (name, logo, contact info)
 * - Team member management
 * - Role and permission settings
 * - Business hours configuration
 * - Branding settings
 * - Service area configuration
 */

import Link from "next/link";
import { 
  ArrowLeft,
  Building2,
  Users,
  Plus,
  Mail,
  Phone,
  MapPin,
  Clock,
  Shield,
  MoreHorizontal,
  Edit2
} from "lucide-react";

export const dynamic = "force-dynamic";

// Placeholder team data
const teamMembers = [
  {
    id: "1",
    name: "John Smith",
    email: "john@example.com",
    role: "Owner",
    status: "active",
    avatar: null,
  },
];

const roles = [
  { id: "owner", name: "Owner", description: "Full access to all features" },
  { id: "admin", name: "Admin", description: "Manage team and settings" },
  { id: "member", name: "Member", description: "Access to workflows and contacts" },
  { id: "viewer", name: "Viewer", description: "Read-only access" },
];

export default async function OrganizationSettingsPage() {
  // TODO: Fetch organization data from database

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="text-gray-500 mt-1">
          Manage your business profile and team
        </p>
      </div>

      {/* Business Profile */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Business Profile</h2>
        </div>
        
        <div className="space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-gray-800 rounded-2xl border border-gray-200 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-gray-500" />
            </div>
            <div>
              <button className="px-4 py-2 bg-brand-600 text-gray-900 rounded-lg font-medium hover:bg-brand-700 transition-colors text-sm">
                Upload Logo
              </button>
              <p className="text-gray-500 text-xs mt-2">PNG, JPG up to 2MB</p>
            </div>
          </div>

          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Business Name
            </label>
            <input
              type="text"
              defaultValue="My Business"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Contact Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Business Email
              </label>
              <input
                type="email"
                placeholder="contact@example.com"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                <Phone className="w-4 h-4 inline mr-2" />
                Business Phone
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              <MapPin className="w-4 h-4 inline mr-2" />
              Business Address
            </label>
            <input
              type="text"
              placeholder="123 Main St, City, State 12345"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="pt-4 border-t border-gray-200 flex justify-end">
            <button className="px-6 py-2.5 bg-brand-600 text-gray-900 rounded-xl font-medium hover:bg-brand-700 transition-colors">
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Business Hours */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Business Hours</h2>
          </div>
          <button className="text-brand-400 hover:text-brand-300 font-medium text-sm flex items-center gap-1">
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        </div>
        
        <div className="space-y-3">
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
            <div key={day} className="flex items-center justify-between py-2">
              <span className="text-gray-600">{day}</span>
              <span className="text-gray-500">9:00 AM - 6:00 PM</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 text-gray-500">
            <span>Saturday</span>
            <span>Closed</span>
          </div>
          <div className="flex items-center justify-between py-2 text-gray-500">
            <span>Sunday</span>
            <span>Closed</span>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-brand-600 text-gray-900 rounded-lg hover:bg-brand-700 transition-colors">
            <Plus className="w-4 h-4" />
            Invite
          </button>
        </div>
        
        <div className="space-y-3">
          {teamMembers.map((member) => (
            <div 
              key={member.id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                  <span className="text-gray-900 font-medium">
                    {member.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-gray-900 font-medium">{member.name}</p>
                  <p className="text-gray-500 text-sm">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="px-2 py-1 text-xs font-medium bg-brand-500/20 text-brand-400 rounded">
                  {member.role}
                </span>
                <button className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-50">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Invite Link */}
        <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <p className="text-gray-500 text-sm mb-2">Invite team members via link</p>
          <div className="flex gap-2">
            <input
              type="text"
              value="https://app.vistrial.com/invite/abc123"
              readOnly
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-200 rounded-lg text-gray-600 text-sm"
            />
            <button className="px-4 py-2 bg-gray-800 text-gray-900 rounded-lg text-sm hover:bg-gray-700 transition-colors">
              Copy
            </button>
          </div>
        </div>
      </div>

      {/* Roles & Permissions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Roles & Permissions</h2>
        </div>
        
        <div className="space-y-3">
          {roles.map((role) => (
            <div 
              key={role.id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
            >
              <div>
                <p className="text-gray-900 font-medium">{role.name}</p>
                <p className="text-gray-500 text-sm">{role.description}</p>
              </div>
              <button className="text-brand-400 hover:text-brand-300 font-medium text-sm">
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
