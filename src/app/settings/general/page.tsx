"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
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
        <RiLoader4Line className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25">
              <RiBuilding2Line className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Business Profile
              </h3>
              <p className="text-sm text-gray-500">
                Update your business information
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name" className="flex items-center gap-2 mb-2">
                <RiBuilding2Line className="h-4 w-4 text-gray-400" />
                Business Name
              </Label>
              <Input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Your Business Name"
              />
            </div>
            <div>
              <Label htmlFor="phone" className="flex items-center gap-2 mb-2">
                <RiPhoneLine className="h-4 w-4 text-gray-400" />
                Phone Number
              </Label>
              <Input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="email" className="flex items-center gap-2 mb-2">
                <RiMailLine className="h-4 w-4 text-gray-400" />
                Business Email
              </Label>
              <Input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="hello@business.com"
              />
            </div>
            <div>
              <Label htmlFor="website" className="flex items-center gap-2 mb-2">
                <RiGlobalLine className="h-4 w-4 text-gray-400" />
                Website
              </Label>
              <Input
                type="url"
                id="website"
                value={formData.website}
                onChange={(e) => updateField("website", e.target.value)}
                placeholder="https://yourbusiness.com"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address" className="flex items-center gap-2 mb-2">
              <RiMapPinLine className="h-4 w-4 text-gray-400" />
              Address
            </Label>
            <Input
              type="text"
              id="address"
              value={formData.address_line1}
              onChange={(e) => updateField("address_line1", e.target.value)}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city" className="mb-2">
                City
              </Label>
              <Input
                type="text"
                id="city"
                value={formData.city}
                onChange={(e) => updateField("city", e.target.value)}
                placeholder="City"
              />
            </div>
            <div>
              <Label htmlFor="state" className="mb-2">
                State
              </Label>
              <Input
                type="text"
                id="state"
                value={formData.state}
                onChange={(e) => updateField("state", e.target.value.toUpperCase())}
                placeholder="CA"
                maxLength={2}
              />
            </div>
            <div>
              <Label htmlFor="zip" className="mb-2">
                ZIP Code
              </Label>
              <Input
                type="text"
                id="zip"
                value={formData.zip}
                onChange={(e) => updateField("zip", e.target.value)}
                placeholder="90210"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
          {saved && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <RiCheckLine className="w-4 h-4" />
              Settings saved successfully
            </div>
          )}
          {!saved && <div />}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RiLoader4Line className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
