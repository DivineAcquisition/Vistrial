import type { Metadata } from "next";

import { OpenConsentButton } from "@/components/marketing/consent-banner";
import { MarketingShell } from "@/components/marketing/chrome";
import { loadTrackingCatalog } from "@/lib/marketing/tracking";
import { marketingHeroTitle } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Cookies",
  description: "How Vistrial uses cookies on the public website.",
};

export default async function CookiesPage() {
  const catalog = await loadTrackingCatalog();
  const tools = catalog.tools.filter((tool) => tool.enabled);
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Cookies</h1>
        <p className="mt-3 text-sm text-dim">Consent version {catalog.settings.version}</p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-silver">
          <p>Cookies and similar tools remember a setting or measure a visit. Essential ones keep the site working. Analytics and advertising stay off until you allow them.</p>
          <p>Essential covers sign-in, security, the form abuse check when it is configured, and the cookie that stores this choice. Analytics covers our own page counts and, when switched on, Google Analytics. Advertising covers the Meta pixel, when switched on. The signed-in application does not use analytics or advertising tools.</p>
          <p>The booking calendar is from GoHighLevel. It does not load until you click to open it, and it may set its own cookies after that.</p>
          <p>If your browser sends Global Privacy Control, we keep analytics and advertising off unless you deliberately turn a category on here. We do not respond to Do Not Track beyond that.</p>
          <p>Your choice applies to this browser. An explicit choice lasts {catalog.settings.lifetimeDays} days. Closing the banner without choosing is treated as reject for {catalog.settings.dismissDays} days.</p>
          <OpenConsentButton label="Change cookie preferences" />
        </div>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm text-silver">
            <thead>
              <tr className="text-white">
                <th className="py-2 pr-3">Tool</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">What it collects</th>
                <th className="py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => (
                <tr key={tool.slug} className="border-t border-white/10 align-top">
                  <td className="py-3 pr-3">
                    <span className="text-white">{tool.name}</span>
                    <span className="block text-xs text-dim">{tool.company}</span>
                    {tool.privacyUrl ? <a className="text-xs text-brand-300 underline" href={tool.privacyUrl}>Provider privacy</a> : null}
                  </td>
                  <td className="py-3 pr-3">{tool.category}</td>
                  <td className="py-3 pr-3">{tool.collects}</td>
                  <td className="py-3">{tool.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </MarketingShell>
  );
}
