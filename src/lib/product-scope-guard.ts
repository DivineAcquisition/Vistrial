import { notFound } from "next/navigation";

import { isProductScopeEnabled, type ProductScopeKey } from "@/lib/product-scope";

/** 404 a parked App Router page. Safe to call from Server Components only. */
export function assertProductScope(key: ProductScopeKey): void {
  if (!isProductScopeEnabled(key)) notFound();
}
