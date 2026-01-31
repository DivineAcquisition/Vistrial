"use client";

import { useState } from "react";
import {
  RiAddLine,
  RiEditLine,
  RiDeleteBinLine,
  RiDraggable,
  RiCheckLine,
  RiCloseLine,
  RiSparklingLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";

interface Service {
  id: string;
  name: string;
  description: string | null;
  pricing_type: string;
  price_1bed: number;
  price_2bed: number;
  price_3bed: number;
  price_4bed: number;
  price_5bed_plus: number;
  price_per_bathroom: number;
  estimated_duration_minutes: number | null;
  is_active: boolean;
  is_recurring_eligible: boolean;
  display_order: number;
}

interface ServicesSettingsProps {
  businessId: string;
  services: Service[];
}

export function ServicesSettings({
  businessId,
  services: initialServices,
}: ServicesSettingsProps) {
  const [services, setServices] = useState(initialServices);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Service>>({});

  const startEdit = (service: Service) => {
    setEditingId(service.id);
    setFormData(service);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({});
    setShowAddForm(false);
  };

  const saveService = async () => {
    const isNew = !editingId;
    const url = isNew
      ? "/api/settings/services"
      : `/api/settings/services/${editingId}`;
    const method = isNew ? "POST" : "PUT";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, service: formData }),
    });

    if (response.ok) {
      const saved = await response.json();
      if (isNew) {
        setServices([...services, saved]);
      } else {
        setServices(services.map((s) => (s.id === saved.id ? saved : s)));
      }
      cancelEdit();
    }
  };

  const deleteService = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service?")) return;

    await fetch(`/api/settings/services/${id}`, { method: "DELETE" });
    setServices(services.filter((s) => s.id !== id));
  };

  const toggleActive = async (service: Service) => {
    const updated = { ...service, is_active: !service.is_active };
    await fetch(`/api/settings/services/${service.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, service: updated }),
    });
    setServices(services.map((s) => (s.id === service.id ? updated : s)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Services</h1>
          <p className="text-slate-500">
            Manage your cleaning service offerings
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setFormData({
              name: "",
              description: "",
              pricing_type: "variable",
              price_1bed: 100,
              price_2bed: 120,
              price_3bed: 140,
              price_4bed: 180,
              price_5bed_plus: 220,
              price_per_bathroom: 15,
              estimated_duration_minutes: 120,
              is_active: true,
              is_recurring_eligible: true,
            });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700"
        >
          <RiAddLine className="w-4 h-4" />
          Add Service
        </button>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        {services.map((service) => (
          <div
            key={service.id}
            className={`bg-white rounded-xl border p-6 ${
              !service.is_active ? "opacity-60" : ""
            }`}
          >
            {editingId === service.id ? (
              <ServiceForm
                data={formData}
                onChange={setFormData}
                onSave={saveService}
                onCancel={cancelEdit}
              />
            ) : (
              <div className="flex items-start gap-4">
                <div className="cursor-grab text-slate-300">
                  <RiDraggable className="w-5 h-5" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900">
                      {service.name}
                    </h3>
                    {!service.is_active && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                        Inactive
                      </span>
                    )}
                    {service.is_recurring_eligible && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                        Recurring eligible
                      </span>
                    )}
                  </div>
                  {service.description && (
                    <p className="text-sm text-slate-500 mb-3">
                      {service.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">1 Bed</p>
                      <p className="font-medium">
                        {formatCurrency(service.price_1bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">2 Bed</p>
                      <p className="font-medium">
                        {formatCurrency(service.price_2bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">3 Bed</p>
                      <p className="font-medium">
                        {formatCurrency(service.price_3bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">4 Bed</p>
                      <p className="font-medium">
                        {formatCurrency(service.price_4bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">5+ Bed</p>
                      <p className="font-medium">
                        {formatCurrency(service.price_5bed_plus)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Per Bath</p>
                      <p className="font-medium">
                        +{formatCurrency(service.price_per_bathroom)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={service.is_active}
                      onChange={() => toggleActive(service)}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-sm text-slate-600">Active</span>
                  </label>
                  <button
                    onClick={() => startEdit(service)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                  >
                    <RiEditLine className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteService(service.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <RiDeleteBinLine className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add New Form */}
        {showAddForm && (
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-slate-900 mb-4">New Service</h3>
            <ServiceForm
              data={formData}
              onChange={setFormData}
              onSave={saveService}
              onCancel={cancelEdit}
            />
          </div>
        )}
      </div>

      {services.length === 0 && !showAddForm && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <RiSparklingLine className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No services yet
          </h3>
          <p className="text-slate-500 mb-4">
            Add your first cleaning service to get started
          </p>
        </div>
      )}
    </div>
  );
}

function ServiceForm({
  data,
  onChange,
  onSave,
  onCancel,
}: {
  data: Partial<Service>;
  onChange: (data: Partial<Service>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Service Name
          </label>
          <input
            type="text"
            value={data.name || ""}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Standard Cleaning"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Duration (minutes)
          </label>
          <input
            type="number"
            value={data.estimated_duration_minutes || ""}
            onChange={(e) =>
              onChange({
                ...data,
                estimated_duration_minutes: Number(e.target.value),
              })
            }
            placeholder="120"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Description
        </label>
        <textarea
          value={data.description || ""}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Regular maintenance cleaning for homes"
          rows={2}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Pricing by Bedrooms
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { key: "price_1bed", label: "1 Bed" },
            { key: "price_2bed", label: "2 Bed" },
            { key: "price_3bed", label: "3 Bed" },
            { key: "price_4bed", label: "4 Bed" },
            { key: "price_5bed_plus", label: "5+ Bed" },
            { key: "price_per_bathroom", label: "/Bath" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">
                {label}
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  value={(data as Record<string, unknown>)[key] as number || ""}
                  onChange={(e) =>
                    onChange({ ...data, [key]: Number(e.target.value) })
                  }
                  className="w-full pl-6 pr-2 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.is_recurring_eligible !== false}
            onChange={(e) =>
              onChange({ ...data, is_recurring_eligible: e.target.checked })
            }
            className="w-5 h-5 rounded"
          />
          <span className="text-sm text-slate-700">
            Eligible for recurring memberships
          </span>
        </label>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <button
          onClick={onSave}
          disabled={!data.name}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          <RiCheckLine className="w-4 h-4" />
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg"
        >
          <RiCloseLine className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
