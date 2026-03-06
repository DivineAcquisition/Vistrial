// ============================================
// Business profile form
// ============================================

"use client";

import { useState } from "react";
import { Building2, Save } from "lucide-react";

interface ProfileSettingsProps {
  business: {
    id: string;
    name: string;
    slug: string;
    phone: string;
    email: string;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    logo_url: string | null;
    website: string | null;
  };
}

export function ProfileSettings({ business }: ProfileSettingsProps) {
  const [formData, setFormData] = useState(business);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const response = await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Business Profile
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Update your business information
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {saved ? (
            <>
              <span className="text-green-300">✓</span>
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </>
          )}
        </button>
      </div>

      <div className="space-y-6 rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        {/* Logo */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Logo
          </label>
          <div className="flex items-center gap-4">
            {formData.logo_url ? (
              <img
                src={formData.logo_url}
                alt="Logo"
                className="h-20 w-20 rounded-lg bg-slate-50 object-contain dark:bg-slate-800"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <Building2 className="h-8 w-8 text-slate-400" />
              </div>
            )}
            <div className="flex-1">
              <input
                type="text"
                value={formData.logo_url || ""}
                onChange={(e) =>
                  setFormData({ ...formData, logo_url: e.target.value })
                }
                placeholder="https://example.com/logo.png"
                className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enter URL or upload to your hosting
              </p>
            </div>
          </div>
        </div>

        {/* Business Name & Slug */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Business Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Booking URL Slug
            </label>
            <div className="flex">
              <span className="rounded-l-lg border border-r-0 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                book.vistrial.io/
              </span>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
                className="flex-1 rounded-r-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Business Address (Optional)
          </label>
          <input
            type="text"
            value={formData.address_line1 || ""}
            onChange={(e) =>
              setFormData({ ...formData, address_line1: e.target.value })
            }
            placeholder="123 Main Street"
            className="mb-2 w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={formData.city || ""}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              placeholder="City"
              className="rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              type="text"
              value={formData.state || ""}
              onChange={(e) =>
                setFormData({ ...formData, state: e.target.value })
              }
              placeholder="State"
              maxLength={2}
              className="rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              type="text"
              value={formData.zip || ""}
              onChange={(e) =>
                setFormData({ ...formData, zip: e.target.value })
              }
              placeholder="Zip"
              maxLength={5}
              className="rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Website (Optional)
          </label>
          <input
            type="url"
            value={formData.website || ""}
            onChange={(e) =>
              setFormData({ ...formData, website: e.target.value })
            }
            placeholder="https://yourcompany.com"
            className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      </div>
    </div>
  );
}
