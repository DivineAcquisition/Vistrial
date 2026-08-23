import { LegalShell, legalMetadata } from "@/components/marketing/legal-shell";
import { APP_NAME, APP_OWNER, CONTACT_EMAIL } from "@/lib/constants";

export const metadata = legalMetadata(
  "Terms",
  `Terms of use for the ${APP_NAME} public site.`
);

export default function TermsPage() {
  return (
    <LegalShell title="Terms">
      <p>
        This site is published by {APP_OWNER} for {APP_NAME}. It is information about the product
        and a way to book a Lead Leak Audit. It is not the product agreement.
      </p>
      <p>
        The audit is a 30-minute review of numbers from your own GoHighLevel account. You keep the
        report either way. Booking it does not create a subscription, a trial, or an obligation to
        buy.
      </p>
      <p>
        Any paid engagement is under a separate written agreement covering scope, price, and
        responsibilities. Nothing on this site is a warranty of a specific close rate.
      </p>
      <p>
        Questions:{" "}
        <a className="text-brand-300 underline-offset-4 hover:text-white hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalShell>
  );
}
