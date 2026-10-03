import { MESSAGE_KIND_COPY, type MessageKind } from "@/lib/sales-os/catalog";

/** A structured update. Not freeform chat: a title, a summary, and labelled sections. */
export type StructuredUpdate = {
  kind: MessageKind;
  title: string;
  summary: string;
  sections: Array<{ heading: string; bullets: string[] }>;
  link?: { label: string; url: string } | null;
};

export const UPDATE_LIMITS = {
  title: 150,
  summary: 1200,
  sections: 6,
  heading: 80,
  bullets: 8,
  bullet: 300,
} as const;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

/** Contact details stay in Vistrial. A channel post never carries a prospect's email or phone number. */
export function scrubContactDetails(text: string): string {
  return text.replace(EMAIL, "[email removed]").replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 8 ? "[phone removed]" : match));
}

function clean(text: string, max: number): string {
  return scrubContactDetails(text.replace(/\s+/g, " ").trim()).slice(0, max);
}

export function normalizeUpdate(input: StructuredUpdate): StructuredUpdate {
  return {
    kind: input.kind,
    title: clean(input.title, UPDATE_LIMITS.title),
    summary: clean(input.summary, UPDATE_LIMITS.summary),
    sections: input.sections.slice(0, UPDATE_LIMITS.sections).map((section) => ({
      heading: clean(section.heading, UPDATE_LIMITS.heading),
      bullets: section.bullets
        .slice(0, UPDATE_LIMITS.bullets)
        .map((bullet) => clean(bullet, UPDATE_LIMITS.bullet))
        .filter(Boolean),
    })).filter((section) => section.heading || section.bullets.length),
    link: input.link && /^https:\/\//.test(input.link.url) ? { label: clean(input.link.label, 80), url: input.link.url } : null,
  };
}

/** Exactly what will appear, as plain text. This is what the approval shows. */
export function updatePreview(update: StructuredUpdate, footer: string): string {
  const lines = [update.title, "", update.summary];
  for (const section of update.sections) {
    lines.push("", section.heading, ...section.bullets.map((bullet) => `• ${bullet}`));
  }
  if (update.link) lines.push("", `${update.link.label}: ${update.link.url}`);
  lines.push("", footer);
  return lines.join("\n").trim();
}

function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slackPayload(update: StructuredUpdate, footer: string) {
  const blocks: Array<Record<string, unknown>> = [
    { type: "header", text: { type: "plain_text", text: update.title.slice(0, 150), emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: escapeSlack(update.summary) } },
  ];
  for (const section of update.sections) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [`*${escapeSlack(section.heading)}*`, ...section.bullets.map((b) => `• ${escapeSlack(b)}`)].join("\n").slice(0, 3000),
      },
    });
  }
  if (update.link) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `<${update.link.url}|${escapeSlack(update.link.label)}>` } });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: escapeSlack(footer) }] });
  return { text: `${update.title}: ${update.summary}`.slice(0, 3000), blocks, unfurl_links: false, unfurl_media: false };
}

const DISCORD_COLOR = 0x9a88fc;

export function discordPayload(update: StructuredUpdate, footer: string) {
  return {
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: update.title.slice(0, 256),
        description: update.summary.slice(0, 4096),
        color: DISCORD_COLOR,
        url: update.link?.url,
        fields: update.sections.slice(0, 25).map((section) => ({
          name: (section.heading || "—").slice(0, 256),
          value: (section.bullets.map((b) => `• ${b}`).join("\n") || "—").slice(0, 1024),
        })),
        footer: { text: footer.slice(0, 2048) },
      },
    ],
  };
}

export function updateFooter(personName: string, kind: MessageKind): string {
  return `${MESSAGE_KIND_COPY[kind].title.replace(/s$/, "")} from Vistrial, posted for ${personName}`;
}

/** Markdown asset body to the small HTML subset Google Docs converts cleanly. */
export function markdownToDocHtml(title: string, basis: string, markdown: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<i>$2</i>")
      .replace(/(^|\s)_(.+?)_(?=\s|$|[.,;:])/g, "$1<i>$2</i>");
  const out: string[] = [`<h1>${esc(title)}</h1>`, `<p><i>${esc(basis)}</i></p>`];
  let list = false;
  let quote: string[] = [];
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map(inline).join("<br>")}</blockquote>`);
    quote = [];
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith(">")) {
      if (list) {
        out.push("</ul>");
        list = false;
      }
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();
    if (/^- /.test(line)) {
      if (!list) {
        out.push("<ul>");
        list = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (list) {
      out.push("</ul>");
      list = false;
    }
    if (/^## /.test(line)) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (/^# /.test(line)) out.push(`<h2>${inline(line.slice(2))}</h2>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flushQuote();
  if (list) out.push("</ul>");
  return `<html><body>${out.join("")}</body></html>`;
}
