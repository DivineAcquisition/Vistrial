"use client";

import nextDynamic from "next/dynamic";

import { Panel } from "@/components/ui/panel";
import type { MapTerritory } from "@/components/territory/map";

/**
 * Leaflet reaches for `window` on import, so the map can only load in the
 * browser. `next/dynamic` with `ssr: false` is not allowed from a Server
 * Component, which is why this thin client wrapper exists.
 */
const TerritoryMap = nextDynamic(
  () => import("@/components/territory/map").then((mod) => mod.TerritoryMap),
  {
    ssr: false,
    loading: () => (
      <Panel className="px-5 py-10 text-sm text-dim">Loading map…</Panel>
    ),
  }
);

export function TerritoryMapPanel({
  territories,
  categories,
}: {
  territories: MapTerritory[];
  categories: { id: string; name: string; slug: string }[];
}) {
  return <TerritoryMap territories={territories} categories={categories} />;
}
