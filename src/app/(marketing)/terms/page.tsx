import { LegalShell, legalMetadata } from "@/components/marketing/legal-shell";
import { TermsOfServiceBody } from "@/components/marketing/terms-of-service";
import { APP_NAME, LEGAL_ENTITY, TERMS_EFFECTIVE, TERMS_LAST_UPDATED } from "@/lib/constants";

export const metadata = legalMetadata(
  "Terms of Service",
  `Terms that govern use of ${APP_NAME}, operated by ${LEGAL_ENTITY}.`
);

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated={TERMS_LAST_UPDATED} effective={TERMS_EFFECTIVE}>
      <TermsOfServiceBody />
    </LegalShell>
  );
}
