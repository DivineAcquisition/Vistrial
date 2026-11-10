/**
 * Turns a page's HTML into what a person would find on it, in reading order: headings, text, buttons and
 * where they go, forms, images and embeds. The same code reads the HTML a plain request returns and the HTML
 * a real browser rendered, so the two ways of opening a page give the same shape.
 *
 * Text a person cannot see (hidden elements, comments, scripts) is left out. Everything kept is still
 * untrusted: it is data about the page, never an instruction to anyone.
 */
import { Parser } from "htmlparser2";

export const SNAPSHOT_LIMITS = {
  blocks: 600,
  blockChars: 600,
  headingChars: 300,
  totalChars: 60_000,
  links: 200,
  images: 80,
  forms: 12,
  fields: 30,
  embeds: 20,
} as const;

export type Region = "header" | "nav" | "main" | "footer" | "aside" | "";

type Placed = { region: Region; section: number };

export type PageBlock = Placed &
  (
    | { kind: "heading"; level: number; text: string }
    | { kind: "text"; tag: string; text: string }
    | { kind: "cta"; text: string; href: string | null; via: "link" | "button"; form: number | null }
    | { kind: "image"; alt: string | null; src: string }
    | { kind: "form"; form: number }
    | { kind: "embed"; what: "video" | "iframe"; host: string | null }
  );

export type PageForm = {
  action: string | null;
  method: string;
  fields: { type: string; name: string; label: string; required: boolean }[];
  submit: string[];
};

export type PageSnapshot = {
  title: string;
  description: string;
  lang: string;
  canonical: string | null;
  /** Reading order. */
  blocks: PageBlock[];
  links: { text: string; href: string; sameSite: boolean; region: Region }[];
  forms: PageForm[];
  facts: {
    words: number;
    headings: number;
    ctas: number;
    images: number;
    imagesWithoutAlt: number;
    forms: number;
    scripts: number;
    stylesheets: number;
    iframes: number;
    /** Links inside the header or nav: the exits a page offers before its first section. */
    navLinks: number;
    /** A class or style on the header or nav says it stays on screen. A hint from the markup, not a measurement. */
    stickyNavHint: boolean;
    /** The page declares a mobile viewport. */
    mobileViewport: boolean;
    /** Characters of text present in the markup but hidden from a reader, which were left out. */
    hiddenChars: number;
    /** Something above was cut at a limit. */
    truncated: boolean;
    /** Little text and many scripts: the page probably builds itself in the browser, so a plain request sees a shell. */
    needsBrowser: boolean;
  };
};

const SKIP = new Set(["script", "style", "template", "noscript", "svg", "canvas", "object", "math", "select", "datalist", "head"]);
/** The only elements that belong in <head>. Anything else means the head has ended, whether or not it was closed. */
const HEAD_OK = new Set(["title", "meta", "link", "script", "style", "base", "noscript", "template"]);
const LANDMARK: Record<string, Region> = { header: "header", nav: "nav", main: "main", footer: "footer", aside: "aside" };
const BREAKS = new Set([
  "p", "div", "section", "article", "li", "ul", "ol", "table", "tr", "td", "th", "form", "blockquote", "figure", "figcaption", "details", "summary",
  "dl", "dt", "dd", "br", "hr", "address", "pre", "label", "header", "footer", "nav", "main", "aside", "fieldset", "legend", "caption", "dialog", "body",
]);
const KEEP_TAG = new Set(["p", "li", "summary", "blockquote", "figcaption", "td", "th", "dt", "dd", "label", "legend", "pre", "caption"]);
const HEADING = /^h([1-6])$/;
const BUTTON_CLASS = /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i;
const STICKY = /(^|[\s:_-])(sticky|fixed|fixed-top|is-sticky|navbar-fixed)([\s_-]|$)/i;
const HIDDEN_STYLE = /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(\.0+)?\s*(;|$)|font-size\s*:\s*0(px|em|rem|%)?\s*(;|$))/i;

function clean(text: string) {
  return text.replace(/[​-‍⁠﻿]/g, "").replace(/\s+/g, " ").trim();
}

function resolve(href: string | undefined, base: URL): string | null {
  if (!href) return null;
  const raw = href.trim();
  if (!raw || raw.startsWith("#")) return raw.startsWith("#") ? raw.slice(0, 120) : null;
  if (/^(javascript|data|vbscript|blob):/i.test(raw)) return null;
  try {
    const url = new URL(raw, base);
    return url.href.slice(0, 500);
  } catch {
    return null;
  }
}

function hostOf(src: string | undefined, base: URL): string | null {
  try {
    return src ? new URL(src, base).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

type Open = { name: string; hidden: boolean; skip: boolean; region: Region };
type Anchor = { href: string | null; button: boolean; text: string; start: number; flushes: number };

/** Reads HTML into a snapshot. `baseUrl` is the page's final address, for resolving its links. */
export function extractPage(html: string, baseUrl: string): PageSnapshot {
  let base = new URL(baseUrl);
  const site = base.hostname.toLowerCase().replace(/^www\./, "");
  const blocks: PageBlock[] = [];
  const links: PageSnapshot["links"] = [];
  const forms: PageForm[] = [];
  const pendingLabels: { form: number; field: number; id: string | null; wrap: number | null }[] = [];
  const labelsFor = new Map<string, string>();
  const wrapLabels: string[] = [];
  const stack: Open[] = [];
  let title = "";
  let description = "";
  let ogTitle = "";
  let ogDescription = "";
  let lang = "";
  let canonical: string | null = null;
  let inTitle = false;
  let buf = "";
  let flushes = 0;
  let total = 0;
  let truncated = false;
  let hiddenChars = 0;
  let section = 0;
  let heading: number | null = null;
  let anchor: Anchor | null = null;
  let button: { form: number | null } | null = null;
  let openForm: number | null = null;
  let looseForm: { index: number; section: number } | null = null;
  let label: { forId: string | null; text: string; wrap: number } | null = null;
  const facts = { images: 0, imagesWithoutAlt: 0, scripts: 0, stylesheets: 0, iframes: 0, navLinks: 0, stickyNavHint: false, mobileViewport: false, ctas: 0, headings: 0, words: 0 };

  const top = () => stack[stack.length - 1];
  const hidden = () => (stack.length ? top().hidden || top().skip : false);
  const place = (): Placed => ({ region: stack.length ? top().region : "", section });

  function push(block: PageBlock) {
    if (blocks.length >= SNAPSHOT_LIMITS.blocks) {
      truncated = true;
      return;
    }
    blocks.push(block);
  }

  function take(max: number): string {
    const text = clean(buf);
    buf = "";
    flushes += 1;
    if (!text) return "";
    if (total >= SNAPSHOT_LIMITS.totalChars) {
      truncated = true;
      return "";
    }
    const kept = text.slice(0, Math.min(max, SNAPSHOT_LIMITS.totalChars - total));
    if (kept.length < text.length) truncated = true;
    total += kept.length;
    facts.words += kept.split(" ").length;
    return kept;
  }

  function flush(tag = "div") {
    const text = take(SNAPSHOT_LIMITS.blockChars);
    if (text) push({ kind: "text", tag: KEEP_TAG.has(tag) ? tag : "div", text, ...place() });
  }

  function formIndex(): number | null {
    if (openForm !== null) return openForm;
    if (looseForm && looseForm.section === section) return looseForm.index;
    if (forms.length >= SNAPSHOT_LIMITS.forms) return null;
    forms.push({ action: null, method: "", fields: [], submit: [] });
    looseForm = { index: forms.length - 1, section };
    push({ kind: "form", form: looseForm.index, ...place() });
    return looseForm.index;
  }

  function cta(text: string, href: string | null, via: "link" | "button", form: number | null) {
    const words = clean(text).slice(0, 160);
    if (!words) return;
    facts.ctas += 1;
    if (form !== null && forms[form] && forms[form].submit.length < 4) forms[form].submit.push(words);
    push({ kind: "cta", text: words, href, via, form, ...place() });
  }

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        // Pages often leave <head> unclosed. Body content must not be read as part of it.
        if (!HEAD_OK.has(name)) {
          const head = stack.findIndex((row) => row.name === "head");
          if (head >= 0) stack.length = head;
        }
        const parent = top();
        const style = attribs.style ?? "";
        const isHidden =
          (parent?.hidden ?? false) ||
          "hidden" in attribs ||
          attribs["aria-hidden"] === "true" ||
          HIDDEN_STYLE.test(style) ||
          (name === "input" && (attribs.type ?? "").toLowerCase() === "hidden") ||
          (name === "dialog" && !("open" in attribs));
        const region = LANDMARK[name] ?? (attribs.role === "navigation" ? "nav" : attribs.role === "banner" ? "header" : attribs.role === "contentinfo" ? "footer" : (parent?.region ?? ""));
        stack.push({ name, hidden: isHidden, skip: (parent?.skip ?? false) || SKIP.has(name), region });

        if (name === "html" && attribs.lang) lang = attribs.lang.slice(0, 20);
        if (name === "title" && parent?.name === "head") inTitle = true;
        if (name === "base" && attribs.href) {
          try {
            base = new URL(attribs.href, base);
          } catch {
            // A broken <base> is ignored.
          }
        }
        if (name === "meta") {
          const key = (attribs.name ?? attribs.property ?? "").toLowerCase();
          const content = clean(attribs.content ?? "").slice(0, 400);
          if (key === "description") description = content;
          else if (key === "og:title") ogTitle = content;
          else if (key === "og:description") ogDescription = content;
          else if (key === "viewport" && /width\s*=\s*device-width/i.test(content)) facts.mobileViewport = true;
        }
        if (name === "link") {
          const rel = (attribs.rel ?? "").toLowerCase();
          if (rel.includes("stylesheet")) facts.stylesheets += 1;
          if (rel === "canonical") canonical = resolve(attribs.href, base);
        }
        if (name === "script") facts.scripts += 1;
        if (isHidden || parent?.skip) return;

        if ((region === "header" || region === "nav") && (STICKY.test(attribs.class ?? "") || /position\s*:\s*(fixed|sticky)/i.test(style))) facts.stickyNavHint = true;
        if (name === "section" || name === "article" || LANDMARK[name]) {
          flush();
          section += 1;
          return;
        }
        const level = name.match(HEADING);
        if (level) {
          flush();
          heading = Number(level[1]);
          return;
        }
        if (name === "a") {
          const role = (attribs.role ?? "").toLowerCase();
          anchor = { href: resolve(attribs.href, base), button: role === "button" || BUTTON_CLASS.test(attribs.class ?? ""), text: "", start: buf.length, flushes };
          return;
        }
        if (name === "button") {
          flush();
          const type = (attribs.type ?? "submit").toLowerCase();
          button = { form: type === "button" ? null : openForm };
          if (attribs["aria-label"]) buf += ` ${attribs["aria-label"]} `;
          return;
        }
        if (name === "form") {
          flush();
          if (forms.length < SNAPSHOT_LIMITS.forms) {
            forms.push({ action: resolve(attribs.action, base), method: (attribs.method ?? "get").toLowerCase().slice(0, 10), fields: [], submit: [] });
            openForm = forms.length - 1;
            push({ kind: "form", form: openForm, ...place() });
          }
          return;
        }
        if (name === "label") {
          flush();
          wrapLabels.push("");
          label = { forId: attribs.for ?? null, text: "", wrap: wrapLabels.length - 1 };
          return;
        }
        if (name === "input" || name === "textarea" || name === "select") {
          const type = name === "input" ? (attribs.type ?? "text").toLowerCase() : name;
          if (type === "submit" || type === "button" || type === "image" || type === "reset") {
            flush();
            if (type !== "reset") cta(attribs.value ?? attribs.alt ?? attribs["aria-label"] ?? "Submit", null, "button", type === "button" ? null : openForm);
            return;
          }
          const index = formIndex();
          if (index === null || forms[index].fields.length >= SNAPSHOT_LIMITS.fields) return;
          forms[index].fields.push({
            type: type.slice(0, 20),
            name: clean(attribs.name ?? "").slice(0, 60),
            label: clean(attribs["aria-label"] ?? attribs.placeholder ?? "").slice(0, 120),
            required: "required" in attribs || attribs["aria-required"] === "true",
          });
          pendingLabels.push({ form: index, field: forms[index].fields.length - 1, id: attribs.id ?? null, wrap: label ? label.wrap : null });
          return;
        }
        if (name === "img") {
          facts.images += 1;
          const alt = "alt" in attribs ? clean(attribs.alt).slice(0, 200) : null;
          if (alt === null) facts.imagesWithoutAlt += 1;
          // An image inside a link or button lends it its words.
          if (alt && anchor) anchor.text += ` ${alt}`;
          if (alt && (button || heading !== null)) buf += ` ${alt} `;
          const src = attribs.src ?? attribs["data-src"] ?? "";
          if (blocks.filter((row) => row.kind === "image").length < SNAPSHOT_LIMITS.images) {
            flush();
            push({ kind: "image", alt, src: /^data:/i.test(src) ? "inline" : (resolve(src, base) ?? ""), ...place() });
          }
          return;
        }
        if (name === "iframe" || name === "video") {
          if (name === "iframe") facts.iframes += 1;
          if (blocks.filter((row) => row.kind === "embed").length < SNAPSHOT_LIMITS.embeds) {
            flush();
            push({ kind: "embed", what: name === "video" ? "video" : "iframe", host: hostOf(attribs.src ?? attribs["data-src"], base), ...place() });
          }
          return;
        }
        if (BREAKS.has(name)) flush();
      },
      ontext(text) {
        if (inTitle) {
          title += text;
          return;
        }
        if (stack.length === 0) return;
        if (top().skip) return;
        if (top().hidden) {
          hiddenChars += clean(text).length;
          return;
        }
        buf += text;
        if (anchor) anchor.text += text;
        if (label) label.text += text;
      },
      onclosetag(name) {
        // Close everything down to the matching tag. The parser has already implied missing end tags.
        let at = stack.length - 1;
        while (at >= 0 && stack[at].name !== name) at -= 1;
        if (at < 0) return;
        const closing = stack[at];
        const wasHidden = closing.hidden || closing.skip;
        stack.length = at;
        if (name === "title") inTitle = false;
        if (wasHidden) return;

        if (HEADING.test(name) && heading !== null) {
          const text = take(SNAPSHOT_LIMITS.headingChars);
          if (text) {
            facts.headings += 1;
            push({ kind: "heading", level: heading, text, ...place() });
          }
          heading = null;
          return;
        }
        if (name === "a" && anchor) {
          const done = anchor;
          anchor = null;
          const text = clean(done.text).slice(0, 160);
          const region = stack.length ? top().region : "";
          if (done.href && text && !done.href.startsWith("#") && links.length < SNAPSHOT_LIMITS.links) {
            let sameSite = false;
            try {
              sameSite = new URL(done.href).hostname.toLowerCase().replace(/^www\./, "") === site;
            } catch {
              // Not a web address (mailto:, tel:): kept as an outside link.
            }
            links.push({ text, href: done.href, sameSite, region });
          }
          if (done.href && text && (region === "header" || region === "nav")) facts.navLinks += 1;
          // A link styled as a button stands on its own; inside a heading it stays part of the heading.
          if (done.button && heading === null && !button) {
            if (done.flushes === flushes) buf = buf.slice(0, done.start);
            flush();
            cta(text, done.href, "link", null);
          }
          return;
        }
        if (name === "button" && button) {
          const done = button;
          button = null;
          const text = clean(buf);
          buf = "";
          flushes += 1;
          cta(text, null, "button", done.form);
          return;
        }
        if (name === "form") {
          flush();
          openForm = null;
          return;
        }
        if (name === "label" && label) {
          const text = clean(label.text).slice(0, 120);
          if (label.forId) labelsFor.set(label.forId, text);
          wrapLabels[label.wrap] = text;
          label = null;
          flush("label");
          return;
        }
        if (BREAKS.has(name)) flush(name);
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  flush();

  for (const pending of pendingLabels) {
    const field = forms[pending.form]?.fields[pending.field];
    if (!field) continue;
    const text = (pending.id && labelsFor.get(pending.id)) || (pending.wrap !== null ? wrapLabels[pending.wrap] : "") || field.label || field.name;
    field.label = text.slice(0, 120);
  }

  const words = facts.words;
  return {
    title: clean(title).slice(0, 300) || ogTitle,
    description: description || ogDescription,
    lang,
    canonical,
    blocks,
    links,
    forms,
    facts: {
      ...facts,
      forms: forms.length,
      hiddenChars,
      truncated,
      needsBrowser: words < 80 && facts.scripts >= 3,
    },
  };
}

/** The page as plain text in reading order, for a person or a search. Still untrusted. */
export function snapshotText(snapshot: PageSnapshot): string {
  const lines: string[] = [];
  for (const block of snapshot.blocks) {
    if (block.kind === "heading") lines.push(`${"#".repeat(block.level)} ${block.text}`);
    else if (block.kind === "text") lines.push(block.tag === "li" ? `- ${block.text}` : block.text);
    else if (block.kind === "cta") lines.push(`[${block.text}]${block.href ? ` -> ${block.href}` : ""}`);
    else if (block.kind === "image" && block.alt) lines.push(`(image: ${block.alt})`);
    else if (block.kind === "form") {
      const form = snapshot.forms[block.form];
      if (form) lines.push(`(form: ${form.fields.map((field) => field.label || field.type).join(", ") || "no fields"})`);
    } else if (block.kind === "embed") lines.push(`(${block.what}${block.host ? ` from ${block.host}` : ""})`);
  }
  return lines.join("\n");
}
