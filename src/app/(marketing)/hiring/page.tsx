import type { Metadata } from "next";

import { ApplyForm } from "@/app/(marketing)/hiring/apply-form";
import { MarketingShell } from "@/components/marketing/chrome";
import { Panel } from "@/components/ui/panel";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Sales Operator",
  description: "Apply to train as a Sales Operator with Divine Acquisition.",
};

export default function HiringPage() {
  return (
    <MarketingShell headerAction="none">
      <section className="px-5 pb-10 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-2xl">
          <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Sales Operator</h1>
          <p className={`${marketingSubhead} mt-4`}>
            Divine Acquisition places trained operators inside a client&apos;s business. The work is calling and texting new leads, qualifying them, booking the next step, and logging every action. Training comes after hiring. Tell us how to reach you.
          </p>
        </div>
      </section>
      <section className="px-5 pb-20 sm:px-6">
        <Panel className="mx-auto max-w-2xl rounded-3xl border-white/[0.1] p-6 sm:p-8">
          <ApplyForm />
        </Panel>
      </section>
    </MarketingShell>
  );
}
