import { COMPANY_ADDRESS, CONTACT_EMAIL, LEGAL_ENTITY, PRODUCTION_SITE_ORIGIN } from "@/lib/constants";

/**
 * One footer set for every Vistrial email. The words are the counsel draft
 * with the company facts already published on the site. Category F does not
 * send until counsel supplies an advertisement line. This module does not
 * add legal claims of its own.
 *
 * Footer version is recorded on each send. A Platform Admin can publish a
 * replacement through publish_email_footer. Until then, this version is used.
 */

export const FOOTER_VERSION = "2026-10-15-1";

export const EMAIL_CATEGORIES = ["A", "A2", "B", "C", "D", "E", "F", "G", "H", "I"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export type EmailStream = "transactional" | "lifecycle";

/** Facts already published. Not invented for this footer. */
export const EMAIL_IDENTITY = {
  legalEntity: LEGAL_ENTITY,
  mailingAddress: COMPANY_ADDRESS,
  supportEmail: CONTACT_EMAIL,
  privacyUrl: `${PRODUCTION_SITE_ORIGIN}/privacy`,
  termsUrl: `${PRODUCTION_SITE_ORIGIN}/terms`,
  securityUrl: `${PRODUCTION_SITE_ORIGIN}/privacy#security`,
} as const;

/**
 * Counsel has not signed these. Category F stays blocked. Do not invent the
 * missing advertisement line.
 */
export const COUNSEL_FLAGS = [
  "Footer F has no advertisement identification line. That category does not send until counsel supplies the wording.",
  "Footer D and Footer G use the draft privacy wording. Counsel has not confirmed it is enough.",
  "Footer B does not add tax or invoicing language.",
  "People who receive mail do not have a stored country, so this system cannot tell which recipients are in the European Union or another region with extra email rules.",
  "The mail provider client has no per-message switch for open or click tracking. Turn tracking off on the transactional sending domain in the provider dashboard. Categories A, B, G, and H must not be tracked.",
] as const;

const UNSUBSCRIBE_CATEGORIES = new Set<EmailCategory>(["E", "F"]);
const NO_UNSUBSCRIBE = new Set<EmailCategory>(["A", "A2", "B", "G", "H", "I"]);

export function sendingStream(category: EmailCategory): EmailStream {
  return category === "E" || category === "F" ? "lifecycle" : "transactional";
}

export function trackingAllowed(category: EmailCategory): boolean {
  return category === "E" || category === "F";
}

export type FooterVars = {
  recipientEmail?: string;
  workspaceName?: string;
  role?: string;
  inviterName?: string;
  referenceId?: string;
  siteName?: string;
  date?: string;
  preferencesUrl?: string;
  unsubscribeUrl?: string;
};

type LinkKey = "support" | "privacy" | "terms" | "security" | "preferences" | "unsubscribe";

type Segment = { kind: "text"; text: string } | { kind: "link"; key: LinkKey; label: string; href: string };

export type RenderedFooter = {
  category: EmailCategory;
  version: string;
  html: string;
  text: string;
  stream: EmailStream;
};

export type FooterFailure = { ok: false; error: string; missing: string[] };

const PLACEHOLDER = /\{[a-z][a-z0-9_]*\}|\[[A-Z][A-Z0-9 ]+\]/;
const EM_DASH = /\u2014/;

function link(key: LinkKey, label: string, href: string): Segment {
  return { kind: "link", key, label, href };
}

function text(value: string): Segment {
  return { kind: "text", text: value };
}

function identityLine(): Segment[] {
  return [
    text(
      `Vistrial is operated by ${EMAIL_IDENTITY.legalEntity}, ${EMAIL_IDENTITY.mailingAddress}.`
    ),
  ];
}

function policyLinks(includeTerms: boolean): Segment[] {
  const parts: Segment[] = [
    link("privacy", "Privacy Policy", EMAIL_IDENTITY.privacyUrl),
  ];
  if (includeTerms) {
    parts.push(text(" | "));
    parts.push(link("terms", "Terms of Service", EMAIL_IDENTITY.termsUrl));
  }
  return parts;
}

function paragraphsFor(category: EmailCategory, vars: FooterVars): Segment[][] | string[] {
  const support = EMAIL_IDENTITY.supportEmail;
  switch (category) {
    case "A2":
      return [
        [
          text(
            `${vars.inviterName ?? ""} invited you to join ${vars.workspaceName ?? ""} on Vistrial. This invitation expires on ${vars.date ?? ""}. If you do not know this person or were not expecting this invitation, you can ignore this email or tell us at `
          ),
          link("support", support, `mailto:${support}`),
          text("."),
        ],
        ...accountBody(vars),
      ];
    case "A":
      return accountBody(vars);
    case "B":
      return [
        [
          text(
            `This is a billing notice for the ${vars.workspaceName ?? ""} workspace on Vistrial. Questions about a charge or an invoice? Reply to this email or contact `
          ),
          link("support", support, `mailto:${support}`),
          text("."),
        ],
        [text("Payments are processed by Stripe. Vistrial does not see or store your full card details.")],
        [
          text(
            `Invoices are issued by ${EMAIL_IDENTITY.legalEntity}, ${EMAIL_IDENTITY.mailingAddress}.`
          ),
        ],
        policyLinks(true),
      ];
    case "C":
      return [
        [
          text(
            `You are receiving this because you are a ${vars.role ?? ""} in the ${vars.workspaceName ?? ""} workspace on Vistrial. This email does not contain lead messages or call content. Open Vistrial to see details.`
          ),
        ],
        [
          text("Choose which notifications you receive: "),
          link("preferences", "notification settings", vars.preferencesUrl ?? ""),
        ],
        [text("Notices about security, billing, and required alerts cannot be turned off.")],
        identityLine(),
        policyLinks(true),
      ];
    case "D":
      return [
        [
          text(
            `You are receiving this one-time message because you asked for access to Vistrial or contacted us through ${vars.siteName ?? ""}. We use the details you submitted only to review your request and reply to you. To correct or delete your request, reply to this email.`
          ),
        ],
        identityLine(),
        policyLinks(false),
      ];
    case "E":
      return [
        [
          text(
            `You are receiving this because you are setting up the ${vars.workspaceName ?? ""} workspace on Vistrial.`
          ),
        ],
        [
          text("Stop setup tips and check-ins: "),
          link("unsubscribe", "unsubscribe", vars.unsubscribeUrl ?? ""),
        ],
        [text("Account, billing, and security emails will still be sent.")],
        identityLine(),
        policyLinks(true),
      ];
    case "F":
      return ["advertisement identification"];
    case "G":
      return [
        [
          text(
            `This message is about a data or privacy request for the ${vars.workspaceName ?? ""} workspace (reference ${vars.referenceId ?? ""}). Only the requesting Owner and authorized Vistrial staff can act on it. If you did not make this request, contact `
          ),
          link("support", support, `mailto:${support}`),
          text(" right away."),
        ],
        identityLine(),
        policyLinks(true),
      ];
    case "H":
      return [
        [
          text(
            `This reply is from the Vistrial team about your request (reference ${vars.referenceId ?? ""}). You can answer in the product under Help, or reply to this email.`
          ),
        ],
        identityLine(),
        policyLinks(true),
      ];
    case "I":
      return [
        [text("Internal Vistrial message. Do not forward outside the company.")],
        [
          text(
            `This email contains operational information about customer workspaces and was sent to ${vars.recipientEmail ?? ""} because you are assigned to ${vars.workspaceName ?? ""} or hold a platform role.`
          ),
        ],
      ];
  }
}

function accountBody(vars: FooterVars): Segment[][] {
  const support = EMAIL_IDENTITY.supportEmail;
  return [
    [
      text(
        `You are receiving this email because of activity on your Vistrial account (${vars.recipientEmail ?? ""}). If you did not expect it, do not click any links. Contact us at `
      ),
      link("support", support, `mailto:${support}`),
      text(" or review account security at "),
      link("security", "account security", EMAIL_IDENTITY.securityUrl),
      text("."),
    ],
    [text("Vistrial will never ask for your password by email.")],
    identityLine(),
    policyLinks(true),
  ];
}

function requiredVars(category: EmailCategory): Array<keyof FooterVars> {
  switch (category) {
    case "A":
      return ["recipientEmail"];
    case "A2":
      return ["recipientEmail", "inviterName", "workspaceName", "date"];
    case "B":
      return ["workspaceName"];
    case "C":
      return ["role", "workspaceName", "preferencesUrl"];
    case "D":
      return ["siteName"];
    case "E":
      return ["workspaceName", "unsubscribeUrl"];
    case "F":
      return ["preferencesUrl", "unsubscribeUrl"];
    case "G":
      return ["workspaceName", "referenceId"];
    case "H":
      return ["referenceId"];
    case "I":
      return ["recipientEmail", "workspaceName"];
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSegments(paragraphs: Segment[][]): { html: string; text: string } {
  const html = paragraphs
    .map((segments) => {
      const inner = segments
        .map((segment) =>
          segment.kind === "text"
            ? escapeHtml(segment.text)
            : `<a href="${escapeHtml(segment.href)}" style="color:#1c1b22;text-decoration:underline;">${escapeHtml(segment.label)}</a>`
        )
        .join("");
      return `<p style="margin:0 0 10px;">${inner}</p>`;
    })
    .join("");
  const text = paragraphs
    .map((segments) =>
      segments
        .map((segment) => (segment.kind === "text" ? segment.text : `${segment.label} (${segment.href})`))
        .join("")
    )
    .join("\n\n");
  return { html, text };
}

export function renderFooter(args: {
  category: EmailCategory;
  vars: FooterVars;
  /** Platform Admin replacement. Same tokens as the built-in draft. */
  paragraphs?: Segment[][];
}): { ok: true; footer: RenderedFooter } | FooterFailure {
  if (!EMAIL_CATEGORIES.includes(args.category)) {
    return { ok: false, error: "This email has no category, so it was not sent.", missing: ["category"] };
  }
  if (args.category === "F") {
    return {
      ok: false,
      error: "Product update email is waiting on counsel for the advertisement line, so it was not sent.",
      missing: ["advertisement identification"],
    };
  }

  const missing = requiredVars(args.category).filter((key) => !args.vars[key]?.trim());
  const identityMissing = (
    [
      ["legal entity", EMAIL_IDENTITY.legalEntity],
      ["mailing address", EMAIL_IDENTITY.mailingAddress],
      ["support email", EMAIL_IDENTITY.supportEmail],
      ["privacy url", EMAIL_IDENTITY.privacyUrl],
      ["terms url", EMAIL_IDENTITY.termsUrl],
      ["security url", EMAIL_IDENTITY.securityUrl],
    ] as const
  )
    .filter(([, value]) => !value.trim())
    .map(([name]) => name);
  const allMissing = [...missing, ...identityMissing];
  if (allMissing.length > 0) {
    return {
      ok: false,
      error: `Email was not sent. Missing: ${allMissing.join(", ")}.`,
      missing: allMissing,
    };
  }

  const built = paragraphsFor(args.category, args.vars);
  if (!Array.isArray(built) || typeof built[0] === "string") {
    return { ok: false, error: "Email was not sent. The footer is incomplete.", missing: ["footer"] };
  }
  const paragraphs = args.paragraphs ?? (built as Segment[][]);
  const rendered = renderSegments(paragraphs);
  const combined = `${rendered.html}\n${rendered.text}`;
  if (PLACEHOLDER.test(combined) || EM_DASH.test(combined)) {
    return {
      ok: false,
      error: "Email was not sent. The footer still has an unresolved placeholder.",
      missing: ["placeholder"],
    };
  }
  if (NO_UNSUBSCRIBE.has(args.category) && /unsubscribe/i.test(rendered.text)) {
    return {
      ok: false,
      error: "Email was not sent. This category cannot offer unsubscribe.",
      missing: ["unsubscribe"],
    };
  }
  if (UNSUBSCRIBE_CATEGORIES.has(args.category) && !/unsubscribe/i.test(rendered.text)) {
    return {
      ok: false,
      error: "Email was not sent. This category needs an unsubscribe link.",
      missing: ["unsubscribe"],
    };
  }

  return {
    ok: true,
    footer: {
      category: args.category,
      version: FOOTER_VERSION,
      html: `<div style="margin:0;font-size:12px;line-height:18px;color:#6f6c7b;">${rendered.html}</div>`,
      text: rendered.text,
      stream: sendingStream(args.category),
    },
  };
}

export function staffRecipientAllowed(email: string, staffEmails: string[]): boolean {
  const target = email.trim().toLowerCase();
  return staffEmails.some((item) => item.trim().toLowerCase() === target);
}

export function domainOfFrom(from: string): string | null {
  const match = from.match(/@([a-z0-9.-]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Lifecycle mail must leave from a different host than account and billing mail. */
export function lifecycleFromSeparated(transactionalFrom: string, lifecycleFrom: string | null | undefined): boolean {
  if (!lifecycleFrom?.trim()) return false;
  const transactional = domainOfFrom(transactionalFrom);
  const lifecycle = domainOfFrom(lifecycleFrom);
  return Boolean(transactional && lifecycle && transactional !== lifecycle);
}
