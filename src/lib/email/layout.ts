import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

/**
 * Transactional mail shell.
 *
 * Light paper, a single card, the icon at the top left, one action.
 * The mark is public/brand/Vistrial 1.png. The legal footer sits under the card.
 */

/**
 * The icon in public/brand/Vistrial 1.png, copied here so the address has no
 * space. Mail apps drop images whose URL contains a space or percent encoding.
 */
export const EMAIL_LOGO_PATH = "/brand/vistrial-icon.png";

/** Inline id used when the icon is attached to a Resend message. */
export const EMAIL_LOGO_CID = "vistrial-icon";

/** Display size of the square icon. */
const LOGO_WIDTH = 48;
const LOGO_HEIGHT = 48;

const CANVAS = "#f3f1f8";
const CARD = "#ffffff";
const RULE = "#9a88fc";
const LINE = "#e3e0ec";
const INK = "#1c1b22";
const BODY = "#52525b";
const QUIET = "#6f6c7b";
const ACTION = "#262626";
const LINK = "#5140a9";

export type EmailLink = { text: string; href: string };

export type TransactionalEmail = {
  heading: string;
  /** Shown in the message preview, before the card is opened. */
  preheader?: string;
  lines?: string[];
  items?: EmailLink[];
  cta?: { label: string; href: string };
  /** A one-time code, shown large between the copy and the button. */
  code?: string;
  /** Quiet line under the button. */
  footnote?: string;
  /** Absolute logo URL. Defaults to the app origin plus the icon. */
  logoUrl?: string;
  /** Where the icon points. Defaults to the app origin. */
  homeHref?: string;
  /** Legal footer HTML, already escaped. Rendered under the card. */
  footerHtml?: string;
};

export function emailLogoUrl(origin = PRODUCTION_APP_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}${EMAIL_LOGO_PATH}`;
}

export function emailLogoSrc(): string {
  return `cid:${EMAIL_LOGO_CID}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:${BODY};">${escapeHtml(text)}</p>`;
}

function actionButton(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px;">
    <tr>
      <td bgcolor="${ACTION}" style="border-radius:10px;background-color:${ACTION};">
        <a href="${safeHref}" style="display:inline-block;padding:13px 22px;border:1px solid ${ACTION};border-radius:10px;background-color:${ACTION};color:#ffffff;font-size:15px;line-height:20px;font-weight:600;text-decoration:none;">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
}

function itemList(items: EmailLink[]): string {
  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:0 0 12px;">
          <a href="${escapeHtml(item.href)}" style="color:${LINK};font-size:15px;line-height:22px;font-weight:600;text-decoration:underline;">${escapeHtml(item.text)}</a>
        </td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 8px;">${rows}</table>`;
}

export function transactionalEmailHtml(args: TransactionalEmail): string {
  const heading = escapeHtml(args.heading);
  const preheader = escapeHtml(args.preheader?.trim() || args.lines?.[0] || args.heading);
  const logoUrl = escapeHtml(args.logoUrl ?? emailLogoUrl());
  const homeHref = escapeHtml(args.homeHref ?? PRODUCTION_APP_ORIGIN);
  const lines = (args.lines ?? []).filter((line) => line.trim().length > 0).map(paragraph).join("");
  const items = args.items && args.items.length > 0 ? itemList(args.items) : "";
  const code = args.code?.trim()
    ? `<p style="margin:4px 0 20px;font-size:32px;line-height:40px;font-weight:600;letter-spacing:6px;color:${INK};">${escapeHtml(args.code.trim())}</p>`
    : "";
  const button = args.cta ? actionButton(args.cta.label, args.cta.href) : "";
  const footnote = args.footnote?.trim()
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:22px;color:${QUIET};">${escapeHtml(args.footnote)}</p>`
    : "";
  const footer = args.footerHtml
    ? `<tr><td style="padding:18px 8px 0;">${args.footerHtml}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:${CANVAS};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
      ${preheader}${"&nbsp;&zwnj;".repeat(8)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CANVAS}" style="background-color:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${LINE};border-radius:16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td height="3" bgcolor="${RULE}" style="height:3px;background-color:${RULE};font-size:0;line-height:0;">&#8203;</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:28px 32px 32px;">
                      <a href="${homeHref}" style="text-decoration:none;">
                        <img src="${logoUrl}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="Vistrial" style="display:block;border:0;outline:none;text-decoration:none;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;border-radius:10px;" />
                      </a>
                      <h1 style="margin:28px 0 16px;font-size:26px;line-height:34px;font-weight:600;letter-spacing:-0.4px;color:${INK};">${heading}</h1>
                      ${lines}
                      ${items}
                      ${code}
                      ${button}
                      ${footnote}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${footer}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
