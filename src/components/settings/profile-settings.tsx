"use client";

import { useState } from "react";
import Image from "next/image";
import { RiBuilding2Line, RiSaveLine } from "@remixicon/react";

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
          <h1 className="text-2xl font-bold text-slate-900">Business Profile</h1>
          <p className="text-slate-500">Update your business information</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {saved ? (
            <>
              <span className="text-green-300">✓</span>
              Saved!
            </>
          ) : (
            <>
              <RiSaveLine className="w-4 h-4" />
              {saving ? "Saving..." : "Save Changes"}
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Logo
          </label>
          <div className="flex items-center gap-4">
            {formData.logo_url ? (
              <Image
                src={formData.logo_url}
                alt="Logo"
                width={80}
                height={80}
                className="w-20 h-20 rounded-lg object-contain bg-slate-50"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center">
                <RiBuilding2Line className="w-8 h-8 text-slate-400" />
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
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">
                Enter URL or upload to your hosting
              </p>
            </div>
          </div>
        </div>

        {/* Business Name & Slug */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Business Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Booking URL Slug
            </label>
            <div className="flex">
              <span className="px-3 py-2 bg-slate-100 border border-r-0 rounded-l-lg text-sm text-slate-500">
                book.vistrial.io/
              </span>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
                className="flex-1 px-3 py-2 border rounded-r-lg"
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Business Address (Optional)
          </label>
          <input
            type="text"
            value={formData.address_line1 || ""}
            onChange={(e) =>
              setFormData({ ...formData, address_line1: e.target.value })
            }
            placeholder="123 Main Street"
            className="w-full px-3 py-2 border rounded-lg mb-2"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={formData.city || ""}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              placeholder="City"
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              value={formData.state || ""}
              onChange={(e) =>
                setFormData({ ...formData, state: e.target.value })
              }
              placeholder="State"
              maxLength={2}
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              value={formData.zip || ""}
              onChange={(e) =>
                setFormData({ ...formData, zip: e.target.value })
              }
              placeholder="Zip"
              maxLength={5}
              className="px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Website (Optional)
          </label>
          <input
            type="url"
            value={formData.website || ""}
            onChange={(e) =>
              setFormData({ ...formData, website: e.target.value })
            }
            placeholder="https://yourcompany.com"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}
