"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { labelClass, selectClass } from "@/lib/ui";
import type { Territory } from "@/types/database";

export type MapTerritory = Territory & {
  client: { id: string; name: string; status: string } | null;
  categories: { id: string; name: string; slug: string }[];
  appointmentVolume: number;
};

const CATEGORY_COLORS = [
  "#937DFF",
  "#6A00FF",
  "#3DDC97",
  "#F5A524",
  "#F31260",
  "#7828C8",
  "#17C964",
  "#F5A524",
  "#006FEE",
  "#F31260",
  "#A1A1AA",
  "#E4E4E7",
  "#52525B",
  "#D4D4D8",
  "#71717A",
];

function colorFor(slug: string, index: number): string {
  void slug;
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

const markerIcon = new L.DivIcon({
  className: "",
  html: `<span style="display:block;width:10px;height:10px;border-radius:9999px;background:#937DFF;border:2px solid #fff"></span>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 8);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export function TerritoryMap({
  territories,
  categories,
}: {
  territories: MapTerritory[];
  categories: { id: string; name: string; slug: string }[];
}) {
  const [filter, setFilter] = useState("");

  const colorByCategory = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category, index) => {
      map.set(category.id, colorFor(category.slug, index));
    });
    return map;
  }, [categories]);

  const visible = territories.filter(
    (territory) =>
      !filter || territory.categories.some((category) => category.id === filter)
  );

  const points = visible.flatMap((territory) => {
    if (territory.kind === "radius" && territory.center_lat != null && territory.center_lng != null) {
      return [[territory.center_lat, territory.center_lng] as [number, number]];
    }
    return [];
  });

  if (territories.length === 0) {
    return (
      <div className="panel rounded-2xl px-6 py-10 text-center">
        <p className="text-lg font-semibold text-white">No active territories</p>
        <p className="mt-2 text-sm text-silver">
          Add exclusivity territories on a client record and they appear here,
          coloured by service category.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <label className={labelClass} htmlFor="map-category">
          Service category
        </label>
        <select
          id="map-category"
          className={selectClass}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <MapContainer
          center={[39.5, -98.35]}
          zoom={4}
          className="h-[560px] w-full bg-[#0B0B0F]"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <FitBounds points={points} />

          {visible.map((territory) => {
            const color =
              colorByCategory.get(territory.categories[0]?.id ?? "") ?? "#937DFF";

            if (
              territory.kind === "radius" &&
              territory.center_lat != null &&
              territory.center_lng != null &&
              territory.radius_miles != null
            ) {
              return (
                <Circle
                  key={territory.id}
                  center={[territory.center_lat, territory.center_lng]}
                  radius={Number(territory.radius_miles) * 1609.34}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.18,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <TerritoryPopup territory={territory} />
                  </Popup>
                </Circle>
              );
            }

            // Postal codes and named regions: marker at a default US center for
            // the list, with the codes/regions in the popup. Gap: filled polygons
            // need a boundary dataset that is not wired in yet.
            if (points[0]) {
              return (
                <Marker
                  key={territory.id}
                  position={points[0]}
                  icon={markerIcon}
                >
                  <Popup>
                    <TerritoryPopup territory={territory} />
                  </Popup>
                </Marker>
              );
            }

            return null;
          })}
        </MapContainer>
      </div>

      <ul className="flex flex-wrap gap-3 text-xs text-dim">
        {categories.map((category, index) => (
          <li key={category.id} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: colorFor(category.slug, index) }}
            />
            {category.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TerritoryPopup({ territory }: { territory: MapTerritory }) {
  return (
    <div className="space-y-1 text-sm text-zinc-900">
      <p className="font-semibold">{territory.client?.name ?? "Client"}</p>
      <p>{territory.categories.map((category) => category.name).join(", ") || "No category"}</p>
      <p>
        {territory.kind === "radius"
          ? `${territory.radius_miles} mi radius`
          : territory.kind === "postal_codes"
            ? `${territory.postal_codes.length} postal codes`
            : `${territory.region_names.length} regions`}
      </p>
      <p>{territory.appointmentVolume} appointments (all time)</p>
      {territory.kind === "postal_codes" ? (
        <p className="text-xs">{territory.postal_codes.slice(0, 12).join(", ")}</p>
      ) : null}
      {territory.kind === "named_regions" ? (
        <p className="text-xs">{territory.region_names.join(", ")}</p>
      ) : null}
    </div>
  );
}
