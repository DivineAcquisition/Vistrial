import "server-only";

import { salesProducer } from "@/lib/home/areas/sales-producer";
import type { AreaProducer } from "@/lib/home/areas/producer-types";

/**
 * Server half of each area: what finds work for the approval queue. Keyed by
 * the same id as the area's definition in `catalog.ts`.
 */
export const AREA_PRODUCERS: Record<string, AreaProducer> = {
  sales: salesProducer,
};
