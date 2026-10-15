import { CONTACT_EMAIL } from "@/lib/constants";
import { domainOfFrom, sendingStream, type EmailCategory } from "@/lib/email/footer";

/** Account, billing, product, privacy, and support. */
export const TRANSACTIONAL_HOST = "mail.vistrial.io";

/** Setup tips and product news. Not used until its DNS is confirmed. */
export const LIFECYCLE_HOST = "updates.vistrial.io";

/** Replies and Reply-To for every Vistrial email. */
export const EMAIL_REPLY_TO = CONTACT_EMAIL;

/**
 * DNS looked up on 2026-10-15. Update this snapshot only after a fresh lookup
 * shows SPF, DKIM, and DMARC on updates.vistrial.io. The env flag alone cannot
 * turn that stream on while this snapshot says the records are missing.
 *
 * mail.vistrial.io had a Resend DKIM key at resend._domainkey and no SPF or
 * DMARC TXT record. updates.vistrial.io had no TXT, DKIM, or DMARC records.
 * vistrial.io had DMARC (p=quarantine) and a Resend DKIM key, and no SPF TXT
 * record on the apex.
 */
export const DNS_SNAPSHOT = {
  checkedOn: "2026-10-15",
  mail: { host: TRANSACTIONAL_HOST, spf: false, dkim: true, dmarc: false },
  updates: { host: LIFECYCLE_HOST, spf: false, dkim: false, dmarc: false },
} as const;

export function updatesDnsReady(snapshot = DNS_SNAPSHOT): boolean {
  return snapshot.updates.spf && snapshot.updates.dkim && snapshot.updates.dmarc;
}

/** True only after the DNS snapshot is complete and an operator confirms it. */
export function lifecycleSendingOpen(env: { [key: string]: string | undefined } = process.env): boolean {
  return updatesDnsReady() && env.EMAIL_UPDATES_DNS_CONFIRMED === "true";
}

export function streamSendAllowed(args: {
  category: EmailCategory;
  transactionalFrom: string;
  lifecycleFrom: string | null;
  env?: { [key: string]: string | undefined };
}): { ok: true; from: string } | { ok: false; error: string } {
  if (sendingStream(args.category) === "lifecycle") {
    const from = args.lifecycleFrom?.trim() ?? "";
    if (domainOfFrom(from) !== LIFECYCLE_HOST) {
      return { ok: false, error: "Setup tips and product news send from updates.vistrial.io." };
    }
    if (!lifecycleSendingOpen(args.env)) {
      return {
        ok: false,
        error: "updates.vistrial.io is not sending until SPF, DKIM, and DMARC are confirmed.",
      };
    }
    return { ok: true, from };
  }

  const from = args.transactionalFrom.trim();
  if (domainOfFrom(from) === LIFECYCLE_HOST) {
    return { ok: false, error: "Account, billing, and support mail cannot send from updates.vistrial.io." };
  }
  return { ok: true, from };
}
