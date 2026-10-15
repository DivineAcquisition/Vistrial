import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { marketingHeroTitle } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Developers",
  description: "Read your Vistrial workspace and send records in. Version 1.",
};

const SECTIONS = [
  {
    heading: "Getting started",
    body: "An owner creates a key in Settings → Developers. The secret is shown once. Send it as Authorization: Bearer. Examples on this page use the fake key vstr_test_example and the fake workspace ws_example. They are not real.",
  },
  {
    heading: "Authentication",
    body: "Every request is https. A wrong key, a revoked key, and a key from another workspace all look the same: that key is not valid. Test keys only read and write practice rows. Live keys only see live rows.",
  },
  {
    heading: "Scopes",
    body: "Read scopes are separate: leads, touches and call metadata, bookings and outcomes, tasks, playbook runs, and metrics. Write scopes are separate: leads, touches, notes, bookings and outcomes, tasks, and adding an opt-out. Transcript text is a separate scope and is off unless the owner turns it on.",
  },
  {
    heading: "What the API cannot do",
    body: "It cannot send a message, approve or reject a draft, change billing, change who has access, or change how the workspace is configured. Adding an opt-out is the only consent change. Message bodies are not stored, so they are not returned.",
  },
  {
    heading: "Writes",
    body: "Send an Idempotency-Key so a retry does not create a second record. The case file shows the source as API and the key's name. A conflict with a locked field goes to the review queue, and the response says so. Records marked historic do not start alerts, clocks, or drafts.",
  },
  {
    heading: "Errors, limits, and versions",
    body: "Errors are JSON with a plain message and a request id. Times include a time zone. Rate limit headers say how many requests are left this minute. The address starts with /api/v1. A field's meaning does not change inside a version. Daily limits pause with a clear message. There is no overage charge.",
  },
  {
    heading: "Webhooks",
    body: "Events are thin: an id, a type, a time, the workspace, the record ids, the names of fields that changed, and the source. Fetch the record with your key. Signatures use HMAC SHA-256 of the timestamp, a period, and the raw body, in the Vistrial-Signature header. Reject old timestamps. Ordering is not guaranteed. A sequence value and the time are included so you can reconcile. Failed deliveries are retried, then the endpoint is turned off and the owner is told.",
  },
];

export default function DevelopersDocsPage() {
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Developers</h1>
        <p className="mt-4 text-sm leading-relaxed text-silver">
          Version 1 of the Vistrial API. Vistrial does not attribute leads to ads. Source labels come from your own tools.
        </p>
        <div className="mt-8 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="font-heading text-xl text-white">{section.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-silver">{section.body}</p>
            </section>
          ))}
        </div>
        <pre className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-silver">{`curl https://app.vistrial.com/api/v1/leads \\
  -H "Authorization: Bearer vstr_test_example"`}</pre>
      </article>
    </MarketingShell>
  );
}
