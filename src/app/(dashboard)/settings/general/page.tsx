"use client";

import { useState, useEffect } from "react";
import {
  RiBuilding2Line,
  RiPhoneLine,
  RiMailLine,
  RiMapPinLine,
  RiGlobalLine,
  RiLoader4Line,
  RiCheckLine,
} from "@remixicon/react";

export default function GeneralSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address_line1: "",
    city: "",
    state: "",
    zip: "",
    website: "",
  });

  useEffect(() => {
    fetchBusiness();
  }, []);

  const fetchBusiness = async () => {
    try {
      const res = await fetch("/api/settings/business");
      const data = await res.json();

      if (data.business) {
        setFormData({
          name: data.business.name || "",
          phone: data.business.phone || "",
          email: data.business.email || "",
          address_line1: data.business.address_line1 || "",
          city: data.business.city || "",
          state: data.business.state || "",
          zip: data.business.zip || "",
          website: data.business.website || "",
        });
      }
    } catch (err) {
      console.error("Failed to fetch business:", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/settings/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RiLoader4Line className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25">
              <RiBuilding2Line className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Business Profile</h3>
              <p className="text-sm text-gray-400">Update your business information</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                <RiBuilding2Line className="h-4 w-4 text-gray-500" />
                Business Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Your Business Name"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                <RiPhoneLine className="h-4 w-4 text-gray-500" />
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                <RiMailLine className="h-4 w-4 text-gray-500" />
                Business Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="hello@business.com"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                <RiGlobalLine className="h-4 w-4 text-gray-500" />
                Website
              </label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => updateField("website", e.target.value)}
                placeholder="https://yourbusiness.com"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
              <RiMapPinLine className="h-4 w-4 text-gray-500" />
              Address
            </label>
            <input
              type="text"
              value={formData.address_line1}
              onChange={(e) => updateField("address_line1", e.target.value)}
              placeholder="123 Main Street"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-300">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => updateField("city", e.target.value)}
                placeholder="City"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-300">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => updateField("state", e.target.value.toUpperCase())}
                placeholder="CA"
                maxLength={2}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-300">ZIP Code</label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => updateField("zip", e.target.value)}
                placeholder="90210"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          {saved && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <RiCheckLine className="w-4 h-4" />
              Settings saved successfully
            </div>
          )}
          {!saved && <div />}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <RiLoader4Line className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
