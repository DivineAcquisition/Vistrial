import { LegalShell, legalMetadata } from "@/components/marketing/legal-shell";
import { PrivacyPolicyBody } from "@/components/marketing/privacy-policy";
import { APP_NAME, PRIVACY_EFFECTIVE, PRIVACY_LAST_UPDATED } from "@/lib/constants";

export const metadata = legalMetadata(
  "Privacy Policy",
  `What ${APP_NAME} collects, why, how long it is kept, and what you can do about it.`
);

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated={PRIVACY_LAST_UPDATED}
      effective={PRIVACY_EFFECTIVE}
    >
      <PrivacyPolicyBody />
    </LegalShell>
  );
}
