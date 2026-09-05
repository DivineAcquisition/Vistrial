import { redirect } from "next/navigation";

import { getStellarAuthContext } from "@/lib/stellar/auth";
import { stellarLandingPath } from "@/lib/stellar/navigation";

export default async function StellarRootPage() {
  const ctx = await getStellarAuthContext();
  redirect(stellarLandingPath(ctx));
}
