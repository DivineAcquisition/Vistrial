"use client";

import { useState, useEffect } from "react";
import {
  RiFlashlightLine,
  RiLoader4Line,
  RiAddLine,
  RiDeleteBinLine,
  RiCheckLine,
  RiTimeLine,
  RiPriceTag3Line,
} from "@remixicon/react";

interface ServiceType {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  duration_minutes: number;
  is_active: boolean;
}

export default function ServiceTypesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    base_price: "",
    duration_minutes: "60",
  });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const res = await fetch("/api/settings/service-types");
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || []);
      }
    } catch (err) {
      console.error("Failed to fetch services:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/settings/service-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          base_price: parseFloat(formData.base_price) || 0,
          duration_minutes: parseInt(formData.duration_minutes) || 60,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add service");
      }

      await fetchServices();
      setShowAddForm(false);
      setFormData({ name: "", description: "", base_price: "", duration_minutes: "60" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add service");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service type?")) return;

    try {
      const res = await fetch(`/api/settings/service-types?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setServices(services.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete service:", err);
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
      {/* Service Types */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25">
                <RiFlashlightLine className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Service Types</h3>
                <p className="text-sm text-gray-400">Manage the services you offer</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
              className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
            >
              <RiAddLine className="w-4 h-4" />
              Add Service
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
              <h4 className="font-medium text-white mb-4">Add New Service</h4>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-300">Service Name *</label>
                  <input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Deep Clean"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-300">Base Price ($)</label>
                  <input
                    type="number"
                    value={formData.base_price}
                    onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-300">Description</label>
                  <input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-300">Duration (minutes)</label>
                  <input
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                    placeholder="60"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500/50"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={saving || !formData.name}
                  className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <RiLoader4Line className="w-4 h-4 animate-spin" />
                  ) : (
                    <RiCheckLine className="w-4 h-4" />
                  )}
                  Save Service
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ name: "", description: "", base_price: "", duration_minutes: "60" });
                  }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 font-medium text-sm transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Services List */}
          {services.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                <RiFlashlightLine className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">No services yet</h3>
              <p className="text-gray-400 mb-4">Add your first service type to get started</p>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition-all"
                >
                  <RiAddLine className="w-4 h-4" />
                  Add Your First Service
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:border-brand-500/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center border border-brand-500/30">
                      <RiFlashlightLine className="w-5 h-5 text-brand-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{service.name}</h4>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <RiPriceTag3Line className="w-3.5 h-3.5" />
                          ${service.base_price?.toFixed(2) || "0.00"}
                        </span>
                        <span className="flex items-center gap-1">
                          <RiTimeLine className="w-3.5 h-3.5" />
                          {service.duration_minutes || 60} min
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(service.id)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <RiDeleteBinLine className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
