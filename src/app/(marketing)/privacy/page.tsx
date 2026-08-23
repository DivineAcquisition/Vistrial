import { LegalShell, legalMetadata } from "@/components/marketing/legal-shell";
import { APP_NAME, APP_OWNER, CONTACT_EMAIL } from "@/lib/constants";

export const metadata = legalMetadata(
  "Privacy",
  `How ${APP_NAME} handles information you send from this site.`
);

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <p>
        {APP_NAME} is a product of {APP_OWNER}. This page covers the public site at vistrial.io — the
        booking form, the contact form, and the pages around them.
      </p>
      <p>
        When you book a Lead Leak Audit or send a message, we collect what you type: name, email,
        phone, company, and the qualification answers. We use that to review fit, put you on the
        calendar, and follow up. Ad and campaign parameters on the URL may be stored with the
        inquiry so we can see which page or message produced it.
      </p>
      <p>
        The site records page views, which call-to-action you used, how far you scrolled, and
        whether a form was completed. Those events are first-party. They are not sold. They are not
        a profile we sell to anyone else.
      </p>
      <p>
        If you later connect GoHighLevel inside the product, that connection is covered by the
        workspace agreement. Message bodies are not pulled from the CRM. The public site does not
        connect to your CRM.
      </p>
      <p>
        For a copy of what we hold, a correction, or a deletion request, email{" "}
        <a className="text-brand-300 underline-offset-4 hover:text-white hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalShell>
  );
}
