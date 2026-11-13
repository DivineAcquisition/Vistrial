import { redirect } from "next/navigation";

import { BRAND_HREF } from "@/lib/shell/journey";

/** Brands moved to Settings › Brand. Old links and bookmarks land there. */
export default function BrandsPage() {
  redirect(BRAND_HREF);
}
