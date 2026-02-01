"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/Label";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { RiSaveLine, RiLoader4Line } from "@remixicon/react";

export default function BusinessProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    description: "",
  });

  useEffect(() => {
    // Load business data
    async function loadBusiness() {
      try {
        const res = await fetch("/api/settings/business");
        if (res.ok) {
          const data = await res.json();
          setFormData({
            name: data.name || "",
            email: data.email || "",
            phone: data.phone || "",
            address: data.address || "",
            city: data.city || "",
            state: data.state || "",
            zip: data.zip || "",
            description: data.description || "",
          });
        }
      } catch (error) {
        console.error("Failed to load business:", error);
      } finally {
        setLoading(false);
      }
    }
    loadBusiness();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Business Profile</h3>
          <p className="text-sm text-gray-500 mt-1">
            Update your business information and contact details.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="name" className="text-gray-700">Business Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-2 bg-gray-50 border-gray-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20"
                placeholder="Your business name"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-700">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-2 bg-gray-50 border-gray-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20"
                placeholder="email@business.com"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-gray-700">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="mt-2 bg-gray-50 border-gray-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20"
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="address" className="text-gray-700">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="mt-2 bg-gray-50 border-gray-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20"
                placeholder="123 Main St"
              />
            </div>

            <div>
              <Label htmlFor="city" className="text-gray-700">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="mt-2 bg-gray-50 border-gray-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20"
                placeholder="City"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="state" className="text-gray-700">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="mt-2 bg-gray-50 border-gray-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20"
                  placeholder="State"
                />
              </div>
              <div>
                <Label htmlFor="zip" className="text-gray-700">ZIP</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  className="mt-2 bg-gray-50 border-gray-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20"
                  placeholder="12345"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="description" className="text-gray-700">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="mt-2 w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
                placeholder="Tell customers about your business..."
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? (
                <RiLoader4Line className="w-4 h-4 animate-spin" />
              ) : (
                <RiSaveLine className="w-4 h-4" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
