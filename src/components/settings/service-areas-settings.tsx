// ============================================
// Service areas management component
// ============================================

"use client";

import { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";

interface ServiceArea {
  id: string;
  zip: string;
  city: string | null;
  state: string | null;
  is_active: boolean;
}

interface ServiceAreasSettingsProps {
  businessId: string;
  serviceAreas: ServiceArea[];
}

export function ServiceAreasSettings({
  businessId,
  serviceAreas: initialAreas,
}: ServiceAreasSettingsProps) {
  const [serviceAreas, setServiceAreas] = useState(initialAreas);
  const [newZips, setNewZips] = useState("");
  const [adding, setAdding] = useState(false);

  const addZipCodes = async () => {
    const zips = newZips
      .split(/[\s,\n]+/)
      .map((z) => z.trim())
      .filter((z) => /^\d{5}$/.test(z));

    if (zips.length === 0) return;

    setAdding(true);
    const response = await fetch("/api/settings/service-areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, zips }),
    });

    if (response.ok) {
      const saved = await response.json();
      setServiceAreas([...serviceAreas, ...saved]);
      setNewZips("");
    }
    setAdding(false);
  };

  const removeZip = async (id: string) => {
    await fetch(`/api/settings/service-areas/${id}`, { method: "DELETE" });
    setServiceAreas(serviceAreas.filter((a) => a.id !== id));
  };

  const toggleActive = async (area: ServiceArea) => {
    const updated = { ...area, is_active: !area.is_active };
    await fetch(`/api/settings/service-areas/${area.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setServiceAreas(serviceAreas.map((a) => (a.id === area.id ? updated : a)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Service Areas
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Define which zip codes you service
        </p>
      </div>

      {/* Add Zip Codes */}
      <div className="rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <Plus className="h-5 w-5 text-violet-600" />
          Add Zip Codes
        </h2>

        <div className="space-y-4">
          <textarea
            value={newZips}
            onChange={(e) => setNewZips(e.target.value)}
            placeholder={`Enter zip codes separated by commas, spaces, or new lines\n\nExample:\n21201, 21202, 21203\n21204\n21205`}
            rows={4}
            className="w-full rounded-lg border px-4 py-3 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-800"
          />

          <div className="flex items-center gap-4">
            <button
              onClick={addZipCodes}
              disabled={adding || !newZips.trim()}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add Zip Codes"}
            </button>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              {
                newZips
                  .split(/[\s,\n]+/)
                  .filter((z) => /^\d{5}$/.test(z.trim())).length
              }{" "}
              valid zip code(s) detected
            </p>
          </div>
        </div>
      </div>

      {/* Current Service Areas */}
      <div className="rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <MapPin className="h-5 w-5 text-violet-600" />
            Current Service Areas
          </h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {serviceAreas.filter((a) => a.is_active).length} active
          </span>
        </div>

        {serviceAreas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {serviceAreas.map((area) => (
              <div
                key={area.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                  area.is_active
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                    : "border-slate-200 bg-slate-50 opacity-50 dark:border-slate-700 dark:bg-slate-800"
                }`}
              >
                <input
                  type="checkbox"
                  checked={area.is_active}
                  onChange={() => toggleActive(area)}
                  className="h-4 w-4 rounded"
                />
                <span className="font-mono text-sm">{area.zip}</span>
                {area.city && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {area.city}, {area.state}
                  </span>
                )}
                <button
                  onClick={() => removeZip(area.id)}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <MapPin className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">
              No service areas defined. Add zip codes to start accepting
              bookings.
            </p>
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
              Leave empty to accept bookings from any location.
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Note:</strong> If no service areas are defined, bookings will
          be accepted from any zip code. This is useful when starting out. Once
          you add zip codes, only those areas will be accepted.
        </p>
      </div>
    </div>
  );
}
