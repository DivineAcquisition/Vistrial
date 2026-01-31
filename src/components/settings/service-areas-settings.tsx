"use client";

import { useState } from "react";
import { RiMapPinLine, RiAddLine, RiDeleteBinLine } from "@remixicon/react";

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
        <h1 className="text-2xl font-bold text-slate-900">Service Areas</h1>
        <p className="text-slate-500">Define which zip codes you service</p>
      </div>

      {/* Add Zip Codes */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <RiAddLine className="w-5 h-5 text-violet-600" />
          Add Zip Codes
        </h2>

        <div className="space-y-4">
          <textarea
            value={newZips}
            onChange={(e) => setNewZips(e.target.value)}
            placeholder={`Enter zip codes separated by commas, spaces, or new lines\n\nExample:\n21201, 21202, 21203\n21204\n21205`}
            rows={4}
            className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
          />

          <div className="flex items-center gap-4">
            <button
              onClick={addZipCodes}
              disabled={adding || !newZips.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add Zip Codes"}
            </button>

            <p className="text-sm text-slate-500">
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
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <RiMapPinLine className="w-5 h-5 text-violet-600" />
            Current Service Areas
          </h2>
          <span className="text-sm text-slate-500">
            {serviceAreas.filter((a) => a.is_active).length} active
          </span>
        </div>

        {serviceAreas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {serviceAreas.map((area) => (
              <div
                key={area.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                  area.is_active
                    ? "bg-green-50 border-green-200"
                    : "bg-slate-50 border-slate-200 opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={area.is_active}
                  onChange={() => toggleActive(area)}
                  className="w-4 h-4 rounded"
                />
                <span className="font-mono text-sm">{area.zip}</span>
                {area.city && (
                  <span className="text-xs text-slate-500">
                    {area.city}, {area.state}
                  </span>
                )}
                <button
                  onClick={() => removeZip(area.id)}
                  className="text-slate-400 hover:text-red-600"
                >
                  <RiDeleteBinLine className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <RiMapPinLine className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">
              No service areas defined. Add zip codes to start accepting
              bookings.
            </p>
            <p className="text-sm text-slate-400 mt-1">
              Leave empty to accept bookings from any location.
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> If no service areas are defined, bookings will
          be accepted from any zip code. This is useful when starting out. Once
          you add zip codes, only those areas will be accepted.
        </p>
      </div>
    </div>
  );
}
