import { cookies, headers } from "next/headers";

import { MarketingAnalytics } from "@/components/marketing/analytics";
import { GoogleAnalytics, MetaPixel } from "@/components/marketing/tracking-scripts";
import { CONSENT_COOKIE, categoryAllowed, parseConsent } from "@/lib/marketing/consent";
import { loadTrackingCatalog, toolEnabled } from "@/lib/marketing/tracking";
import { loadTrustPublic } from "@/lib/trust/public";

/** Server gate. Optional scripts are absent from the HTML until the choice allows them. */
export async function PublicTrackers() {
  const [jar, headerStore, catalog, trust] = await Promise.all([
    cookies(),
    headers(),
    loadTrackingCatalog(),
    loadTrustPublic(),
  ]);
  const choice = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  const gpc = headerStore.get("sec-gpc") === "1";
  const shared = {
    choice,
    gpc,
    version: catalog.settings.version,
    dismissDays: catalog.settings.dismissDays,
    lifetimeDays: catalog.settings.lifetimeDays,
  };
  const analytics = categoryAllowed({ ...shared, category: "analytics" });
  const advertising = categoryAllowed({ ...shared, category: "advertising" });
  const thirdParty = trust.privacyLive;

  return (
    <>
      {analytics && toolEnabled(catalog.tools, "first-party") ? <MarketingAnalytics /> : null}
      {analytics && thirdParty && toolEnabled(catalog.tools, "google-analytics") ? <GoogleAnalytics /> : null}
      {advertising && thirdParty && toolEnabled(catalog.tools, "meta-pixel") ? <MetaPixel /> : null}
    </>
  );
}
