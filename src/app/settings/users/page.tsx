"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
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
        <RiLoader4Line className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Service Types */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25">
                <RiFlashlightLine className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Service Types
                </h3>
                <p className="text-sm text-gray-500">
                  Manage the services you offer
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowAddForm(true)}
              size="sm"
              disabled={showAddForm}
            >
              <RiAddLine className="w-4 h-4 mr-1" />
              Add Service
            </Button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900 mb-4">Add New Service</h4>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="name" className="mb-2">
                    Service Name *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Deep Clean"
                  />
                </div>
                <div>
                  <Label htmlFor="price" className="mb-2">
                    Base Price ($)
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    value={formData.base_price}
                    onChange={(e) =>
                      setFormData({ ...formData, base_price: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="description" className="mb-2">
                    Description
                  </Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Brief description"
                  />
                </div>
                <div>
                  <Label htmlFor="duration" className="mb-2">
                    Duration (minutes)
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) =>
                      setFormData({ ...formData, duration_minutes: e.target.value })
                    }
                    placeholder="60"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleAdd} disabled={saving || !formData.name}>
                  {saving ? (
                    <RiLoader4Line className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <RiCheckLine className="w-4 h-4 mr-1" />
                  )}
                  Save Service
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ name: "", description: "", base_price: "", duration_minutes: "60" });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Services List */}
          {services.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <RiFlashlightLine className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                No services yet
              </h3>
              <p className="text-gray-500 mb-4">
                Add your first service type to get started
              </p>
              {!showAddForm && (
                <Button onClick={() => setShowAddForm(true)}>
                  <RiAddLine className="w-4 h-4 mr-1" />
                  Add Your First Service
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-brand-300 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                      <RiFlashlightLine className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{service.name}</h4>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(service.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <RiDeleteBinLine className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
