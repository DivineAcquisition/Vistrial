"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/Label";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { RiAddLine, RiDeleteBinLine, RiLoader4Line, RiTimeLine, RiPriceTag3Line } from "@remixicon/react";

interface ServiceType {
  id: string;
  name: string;
  description?: string;
  duration_minutes: number;
  base_price: number;
}

export default function ServiceTypesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newService, setNewService] = useState({
    name: "",
    description: "",
    duration_minutes: 60,
    base_price: 0,
  });

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    try {
      const res = await fetch("/api/settings/service-types");
      if (res.ok) {
        const data = await res.json();
        setServices(data);
      }
    } catch (error) {
      console.error("Failed to load services:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/service-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newService),
      });
      if (res.ok) {
        setNewService({ name: "", description: "", duration_minutes: 60, base_price: 0 });
        setShowAddForm(false);
        loadServices();
      }
    } catch (error) {
      console.error("Failed to add service:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this service type?")) return;
    try {
      const res = await fetch(`/api/settings/service-types?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        loadServices();
      }
    } catch (error) {
      console.error("Failed to delete service:", error);
    }
  }

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
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Service Types</h3>
            <p className="text-sm text-gray-500 mt-1">
              Configure the services you offer to customers.
            </p>
          </div>
          <Button
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm}
            className="gap-2"
          >
            <RiAddLine className="w-4 h-4" />
            Add Service
          </Button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="p-6 bg-gray-50 border-b border-gray-100">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="service-name" className="text-gray-700">Service Name</Label>
                <Input
                  id="service-name"
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                  className="mt-2 bg-white border-gray-200"
                  placeholder="e.g., Deep Cleaning"
                  required
                />
              </div>
              <div>
                <Label htmlFor="service-desc" className="text-gray-700">Description (optional)</Label>
                <Input
                  id="service-desc"
                  value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  className="mt-2 bg-white border-gray-200"
                  placeholder="Brief description"
                />
              </div>
              <div>
                <Label htmlFor="service-duration" className="text-gray-700">Duration (minutes)</Label>
                <Input
                  id="service-duration"
                  type="number"
                  value={newService.duration_minutes}
                  onChange={(e) => setNewService({ ...newService, duration_minutes: parseInt(e.target.value) || 60 })}
                  className="mt-2 bg-white border-gray-200"
                  min={15}
                  step={15}
                />
              </div>
              <div>
                <Label htmlFor="service-price" className="text-gray-700">Base Price ($)</Label>
                <Input
                  id="service-price"
                  type="number"
                  value={newService.base_price}
                  onChange={(e) => setNewService({ ...newService, base_price: parseFloat(e.target.value) || 0 })}
                  className="mt-2 bg-white border-gray-200"
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <RiLoader4Line className="w-4 h-4 animate-spin" />
                ) : (
                  "Add Service"
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Services List */}
        <div className="divide-y divide-gray-100">
          {services.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <RiPriceTag3Line className="w-6 h-6 text-gray-400" />
              </div>
              <h4 className="text-gray-900 font-medium mb-1">No services yet</h4>
              <p className="text-sm text-gray-500">
                Add your first service type to start booking.
              </p>
            </div>
          ) : (
            services.map((service) => (
              <div key={service.id} className="p-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                  <RiPriceTag3Line className="w-5 h-5 text-brand-600" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900">{service.name}</h4>
                  {service.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{service.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <RiTimeLine className="w-3.5 h-3.5" />
                      {service.duration_minutes} min
                    </span>
                    <span className="text-xs text-gray-500">
                      ${service.base_price.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(service.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete service"
                >
                  <RiDeleteBinLine className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
