import { LegalShell, legalMetadata } from "@/components/marketing/legal-shell";
import { DisclaimerBody } from "@/components/marketing/disclaimer";
import { APP_NAME, DISCLAIMER_LAST_UPDATED, LEGAL_ENTITY } from "@/lib/constants";

export const metadata = legalMetadata(
  "Disclaimer",
  `Limits of what the ${APP_NAME} website, marketing, and product represent. Operated by ${LEGAL_ENTITY}.`
);

export default function DisclaimerPage() {
  return (
    <LegalShell title="Disclaimer" updated={DISCLAIMER_LAST_UPDATED}>
      <DisclaimerBody />
    </LegalShell>
  );
}
