import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { formatTrustDate } from "@/lib/trust/model";
import { loadPublicSubprocessors, loadTrustPublic } from "@/lib/trust/public";
import { marketingHeroTitle, marketingLead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Subprocessors",
  description: "Companies Vistrial uses to run the service, and what data they handle.",
};

export default async function SubprocessorsPage() {
  const [trust, rows] = await Promise.all([loadTrustPublic(), loadPublicSubprocessors()]);
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Subprocessors</h1>
        <p className={`${marketingLead} mt-4`}>
          Vistrial uses these companies to run the service. A row appears here only after a location is confirmed and a Platform Admin publishes it. We tell customers before a new published row is added.
        </p>
        <p className="mt-3 text-xs text-dim">Last updated: {formatTrustDate(trust.subprocessorsUpdatedOn)}</p>
        {rows.length ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[#2a2833] text-xs tracking-wide text-dim uppercase">
                  <th className="py-2 pr-4 font-medium">Company</th>
                  <th className="py-2 pr-4 font-medium">What they do</th>
                  <th className="py-2 pr-4 font-medium">What data</th>
                  <th className="py-2 font-medium">Where</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.company} className="border-b border-[#2a2833] align-top">
                    <td className="py-3 pr-4 text-white">{row.company}</td>
                    <td className="py-3 pr-4 text-silver">{row.purpose}</td>
                    <td className="py-3 pr-4 text-silver">{row.dataHandled}</td>
                    <td className="py-3 text-silver">{row.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-8 text-sm text-silver">No subprocessor row is published yet. Locations are still being confirmed.</p>
        )}
        <p className="mt-8 text-sm leading-relaxed text-silver">
          The tools you connect, such as your CRM, are your own accounts. They are not listed here as our subprocessors.
        </p>
        <p className="mt-3 text-sm text-silver">
          To be told when this list changes, email {trust.securityEmail} with the subject Subprocessor updates.
        </p>
      </article>
    </MarketingShell>
  );
}
