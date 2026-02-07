// ============================================
// Services CRUD component
// ============================================

"use client";

import { useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  Check,
  X,
  Sparkles,
} from "lucide-react";
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Services
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
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
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          Add Service
        </button>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        {services.map((service) => (
          <div
            key={service.id}
            className={`rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900 ${
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
                <div className="cursor-grab text-slate-300 dark:text-slate-600">
                  <GripVertical className="h-5 w-5" />
                </div>

                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                      {service.name}
                    </h3>
                    {!service.is_active && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">
                        Inactive
                      </span>
                    )}
                    {service.is_recurring_eligible && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Recurring eligible
                      </span>
                    )}
                  </div>
                  {service.description && (
                    <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                      {service.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">
                        1 Bed
                      </p>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {formatCurrency(service.price_1bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">
                        2 Bed
                      </p>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {formatCurrency(service.price_2bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">
                        3 Bed
                      </p>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {formatCurrency(service.price_3bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">
                        4 Bed
                      </p>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {formatCurrency(service.price_4bed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">
                        5+ Bed
                      </p>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {formatCurrency(service.price_5bed_plus)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">
                        Per Bath
                      </p>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        +{formatCurrency(service.price_per_bathroom)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={service.is_active}
                      onChange={() => toggleActive(service)}
                      className="h-5 w-5 rounded"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Active
                    </span>
                  </label>
                  <button
                    onClick={() => startEdit(service)}
                    className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteService(service.id)}
                    className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add New Form */}
        {showAddForm && (
          <div className="rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">
              New Service
            </h3>
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
        <div className="rounded-xl border bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="mb-2 text-lg font-medium text-slate-900 dark:text-slate-100">
            No services yet
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
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
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Service Name
          </label>
          <input
            type="text"
            value={data.name || ""}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Standard Cleaning"
            className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
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
            className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Description
        </label>
        <textarea
          value={data.description || ""}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Regular maintenance cleaning for homes"
          rows={2}
          className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Pricing by Bedrooms
        </label>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            { key: "price_1bed", label: "1 Bed" },
            { key: "price_2bed", label: "2 Bed" },
            { key: "price_3bed", label: "3 Bed" },
            { key: "price_4bed", label: "4 Bed" },
            { key: "price_5bed_plus", label: "5+ Bed" },
            { key: "price_per_bathroom", label: "/Bath" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
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
                  className="w-full rounded-lg border py-2 pl-6 pr-2 text-sm dark:border-slate-700 dark:bg-slate-800"
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
            className="h-5 w-5 rounded"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Eligible for recurring memberships
          </span>
        </label>
      </div>

      <div className="flex gap-3 border-t pt-4 dark:border-slate-700">
        <button
          onClick={onSave}
          disabled={!data.name}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 dark:border-slate-700"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
