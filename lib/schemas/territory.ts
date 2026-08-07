import { z } from "zod";

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
});

export const setCategoriesSchema = z.object({
  client_id: z.uuid(),
  category_ids: z.array(z.uuid()),
  exclusivity_status: z.enum(["active", "overridden", "not_offered"]),
  override_reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

const postalList = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(/[\n,]+/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean)
  );

const regionList = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(/[\n,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  );

export const territorySchema = z.discriminatedUnion("kind", [
  z.object({
    client_id: z.uuid(),
    kind: z.literal("radius"),
    label: z.string().trim().max(160).optional().or(z.literal("")),
    center_lat: z.coerce.number().min(-90).max(90),
    center_lng: z.coerce.number().min(-180).max(180),
    center_address: z.string().trim().max(300).optional().or(z.literal("")),
    radius_miles: z.coerce.number().positive().max(500),
  }),
  z.object({
    client_id: z.uuid(),
    kind: z.literal("postal_codes"),
    label: z.string().trim().max(160).optional().or(z.literal("")),
    postal_codes: postalList.refine((list) => list.length > 0, "Add at least one postal code."),
  }),
  z.object({
    client_id: z.uuid(),
    kind: z.literal("named_regions"),
    label: z.string().trim().max(160).optional().or(z.literal("")),
    region_names: regionList.refine((list) => list.length > 0, "Add at least one region."),
  }),
]);

export const deleteTerritorySchema = z.object({
  id: z.uuid(),
  client_id: z.uuid(),
});

export const overrideConflictSchema = z.object({
  client_id: z.uuid(),
  other_client_id: z.uuid(),
  shared_category_ids: z.array(z.uuid()).min(1),
  overlap_summary: z.string().trim().min(1).max(2000),
  reason: z
    .string()
    .trim()
    .min(10, "Record why exclusivity is being overridden.")
    .max(2000),
});

export const acknowledgeMatchSchema = z.object({
  id: z.uuid(),
});

export const crossClientWindowSchema = z.object({
  days: z.coerce.number().int().min(1).max(365),
});
