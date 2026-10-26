import type { TrustPublic } from "@/lib/trust/model";
import { formatTrustDate } from "@/lib/trust/model";
import { marketingHeroTitle } from "@/lib/marketing/ui";

/** Shown on the public site only after a Platform Admin marks the page approved and the legal identity is filled in. */
export function LegalDraft({ kind, trust }: { kind: "privacy" | "terms"; trust: TrustPublic }) {
  const date = formatTrustDate(kind === "privacy" ? trust.privacyUpdatedOn : trust.termsUpdatedOn);
  return (
    <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6">
      <p className="rounded-2xl border border-border px-4 py-3 text-sm text-strong">
        Draft prepared for review by qualified counsel. Not legal advice. A Platform Admin marked this page approved for the public site.
      </p>
      <h1 className={`${marketingHeroTitle} mt-8 text-[2.1rem] sm:text-4xl`}>{kind === "privacy" ? "Privacy" : "Terms"}</h1>
      <p className="mt-2 text-xs text-muted-foreground">Last updated: {date}</p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>{trust.legalEntity} operates Vistrial. Mailing address: {trust.mailingAddress}. Place named for counsel review: {trust.governingPlace}.</p>
        {kind === "privacy" ? (
          <>
            <p>We collect account details, workspace data you connect (CRM records, call transcripts when a recording source is connected, bookings, notes), billing references handled by Stripe, and the forms on this website. We do not store full card numbers.</p>
            <p>Compass does not show message threads. Call transcripts are kept when you connect recordings, because case files are built from them.</p>
            <p>We use the data to run the service, keep it secure, bill, and answer requests. For lead data inside a workspace, the customer decides the purpose and Vistrial processes it for that customer. Counsel should confirm the processor wording.</p>
            <p>We share data with the companies on the subprocessors page, and when the law requires it. {trust.switches.noSell ? "We do not sell your data." : null}</p>
            <p>Raw webhook payloads are kept for a short operational window. Case files stay while the workspace is active. Deletion happens after a person verifies a request. It is not automatic.</p>
            <p>Security measures are described on the Security page. This policy does not repeat lines that are switched off there.</p>
            <p>The service is not for anyone under 18. Region specific rights, including Maryland and any European or UK rights, are for counsel to add.</p>
            <p>Contact {trust.privacyEmail}. Data requests: /privacy/requests.</p>
          </>
        ) : (
          <>
            <p>Vistrial is for business customers. Private Access is reviewed before a workspace is opened. Accounts are invitation based.</p>
            <p>You are responsible for having the right to contact your leads, for honoring opt-outs, and for the calling and recording rules that apply to you. The approval step and quiet hours are product safeguards. They are not a promise that a send is lawful. Counsel should review that sentence.</p>
            <p>You own your customer data. Vistrial processes it to provide the service. You are responsible for the accounts you connect, including your CRM.</p>
            <p>The public price line says starting at $97 per month for Private Access, and asks you to talk for Custom. That price is display copy until billing is connected. Charges go through Stripe after approval. There is a 30 day grace before an offboarding deletion in the operations settings. A day 8 and day 60 schedule was not found in the product, so it is not stated here.</p>
            <p>Agent drafts can be wrong. A person approves anything that would reach a lead.</p>
            <p>Vistrial is not SOC 2 or ISO 27001 certified. Disclaimers, liability limits, and the dispute process are for counsel. The place named for that review is {trust.governingPlace}.</p>
            <p>Contact {trust.legalEmail}.</p>
          </>
        )}
      </div>
    </article>
  );
}
