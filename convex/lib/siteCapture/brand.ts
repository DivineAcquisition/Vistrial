/**
 * A site's brand, found in code from its own markup and stylesheets: colours, fonts, the logo, social
 * links, and what its structured data says about the business. No model is involved, so nothing here can be
 * invented: every value points at where it was found.
 */
import type { BrandSignals, PageSnapshot } from "../pageReader/extract";
import type { CapturedColor, FieldSource } from "./fields";

// ------------------------------------------------------------------------------------------------ colours

const HEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RGB = /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi;
const BRAND_VAR = /--(?:[\w-]*-)?(primary|brand|accent|secondary|main|highlight|theme)(?:-[\w-]*)?\s*:\s*([^;}{]+)/gi;
const BUTTON_SELECTOR = /(btn|button|cta|primary|accent|brand|wp-block-button|elementor-button|\ba\b|\ba:|\ba\.|link)/i;
const COLOR_PROP = /^(background(-color)?|color|border(-color)?|fill|outline-color|border-top-color|border-bottom-color)$/i;

function hex2(n: number) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

/** Any CSS colour we can read as "#rrggbb", or null (named colours, gradients and variables are not read). */
export function toHex(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const body = hex[1];
    return body.length === 3 ? `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}` : `#${body}`;
  }
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
    if (alpha < 0.5) return null;
    return `#${hex2(Number(rgb[1]))}${hex2(Number(rgb[2]))}${hex2(Number(rgb[3]))}`;
  }
  return null;
}

/** Greys, near white and near black are a page's furniture, not its brand. */
export function isNeutral(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2 / 255;
  const chroma = (max - min) / 255;
  return chroma < 0.12 || light > 0.94 || light < 0.08;
}

/** Two colours a person would call the same (a hover shade of the button colour). */
function close(a: string, b: string) {
  const d = [1, 3, 5].reduce((sum, at) => sum + Math.abs(parseInt(a.slice(at, at + 2), 16) - parseInt(b.slice(at, at + 2), 16)), 0);
  return d < 36;
}

function colorsIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(HEX)) {
    const hex = toHex(match[0]);
    if (hex) out.push(hex);
  }
  for (const match of text.matchAll(RGB)) {
    const hex = toHex(match[0]);
    if (hex) out.push(hex);
  }
  return out;
}

export type CssSource = { css: string; url: string; pageId: string | null; how: "stylesheet" | "page text" };
type Tally = { hex: string; score: number; label: string; source: FieldSource };

/**
 * The brand's colours, at most four, most telling first: the theme colour the site declares, colours set in
 * brand-named variables (`--primary`, `--brand`...), then the colours its buttons and links use most. Each
 * says where it was found.
 */
export function brandColors(themeColor: { value: string | null; url: string; pageId: string | null }, sheets: CssSource[], max = 4): { colors: CapturedColor[]; sources: FieldSource[] } {
  const tallies: Tally[] = [];
  const add = (hex: string | null, score: number, label: string, source: FieldSource) => {
    if (!hex || isNeutral(hex)) return;
    const same = tallies.find((row) => close(row.hex, hex));
    if (same) {
      same.score += score;
      if (score >= 50 && same.score - score < 50) same.label = label;
    } else tallies.push({ hex, score, label, source });
  };
  add(themeColor.value ? toHex(themeColor.value) : null, 100, "Set as your site's theme colour", { url: themeColor.url, pageId: themeColor.pageId, how: "meta tag" });
  for (const sheet of sheets) {
    const source: FieldSource = { url: sheet.url, pageId: sheet.pageId, how: sheet.how };
    for (const match of sheet.css.matchAll(BRAND_VAR)) {
      for (const hex of colorsIn(match[2])) add(hex, 50, `Your "${match[1].toLowerCase()}" colour`, source);
    }
    // Rule by rule: colours on buttons and links count most.
    for (const chunk of sheet.css.split("}")) {
      const open = chunk.indexOf("{");
      if (open < 0) continue;
      const selector = chunk.slice(0, open);
      if (/@(font-face|keyframes)/i.test(selector)) continue;
      const weight = BUTTON_SELECTOR.test(selector) ? 3 : 1;
      for (const decl of chunk.slice(open + 1).split(";")) {
        const colon = decl.indexOf(":");
        if (colon < 0) continue;
        const prop = decl.slice(0, colon).trim();
        if (!COLOR_PROP.test(prop)) continue;
        for (const hex of colorsIn(decl.slice(colon + 1))) add(hex, weight, weight === 3 ? "Used on your buttons and links" : "Used across your pages", source);
      }
    }
  }
  const top = tallies.filter((row) => row.score >= 2).sort((a, b) => b.score - a.score).slice(0, max);
  const sources: FieldSource[] = [];
  for (const row of top) if (!sources.some((source) => source.url === row.source.url && source.how === row.source.how)) sources.push(row.source);
  return { colors: top.map((row) => ({ hex: row.hex, label: row.label })), sources };
}

// -------------------------------------------------------------------------------------------------- fonts

const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|inherit|initial|unset|revert|var\(.*|helvetica|helvetica neue|arial|segoe ui|roboto|times new roman|times|georgia|verdana|tahoma|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|courier new|courier)$/i;
const HEADING_SELECTOR = /(^|[\s,>+~])(h[1-3])\b|heading|title|display|headline/i;
const BODY_SELECTOR = /(^|[\s,])(body|html|p)\b|(^|[\s,]):root\b/i;
const FONT_VAR = /--(?:[\w-]*-)?(font|family|ff)(?:-[\w-]*)?(heading|display|title|body|base|text|sans|serif|primary|secondary)?[\w-]*\s*:\s*([^;}{]+)/gi;

/** The first font in a `font-family` list that is a real typeface, not a fallback. */
export function firstFamily(list: string): string | null {
  for (const raw of list.split(",")) {
    const name = raw.trim().replace(/^["']|["']$/g, "").replace(/\s*!important$/i, "").trim();
    if (name && !GENERIC.test(name) && name.length <= 60 && !/[{};]/.test(name)) return name;
  }
  return null;
}

/** Font families named in a Google Fonts (or Bunny Fonts) stylesheet link. */
export function familiesFromLink(href: string): string[] {
  try {
    const url = new URL(href);
    const out: string[] = [];
    for (const value of url.searchParams.getAll("family")) {
      for (const part of value.split("|")) {
        const name = part.split(":")[0].replace(/\+/g, " ").trim();
        if (name) out.push(name);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * The heading and body fonts: from the families set on headings and on the body in the site's CSS, then
 * from font variables, then from the fonts its font links load (first for headings, second for body when
 * only links say).
 */
export function brandFonts(fontLinks: { href: string; url: string; pageId: string | null }[], sheets: CssSource[]) {
  let heading: { name: string; source: FieldSource } | null = null;
  let body: { name: string; source: FieldSource } | null = null;
  for (const sheet of sheets) {
    const source: FieldSource = { url: sheet.url, pageId: sheet.pageId, how: sheet.how };
    for (const chunk of sheet.css.split("}")) {
      const open = chunk.indexOf("{");
      if (open < 0) continue;
      const selector = chunk.slice(0, open);
      if (/@font-face/i.test(selector)) continue;
      const decl = chunk.slice(open + 1).match(/font-family\s*:\s*([^;]+)/i);
      if (!decl) continue;
      const name = firstFamily(decl[1]);
      if (!name) continue;
      if (!heading && HEADING_SELECTOR.test(selector)) heading = { name, source };
      else if (!body && BODY_SELECTOR.test(selector)) body = { name, source };
    }
    for (const match of sheet.css.matchAll(FONT_VAR)) {
      const name = firstFamily(match[3]);
      if (!name) continue;
      const role = (match[2] ?? "").toLowerCase();
      if (!heading && /heading|display|title/.test(role)) heading = { name, source };
      if (!body && /body|base|text/.test(role)) body = { name, source };
    }
  }
  const linked = fontLinks.flatMap((link) => familiesFromLink(link.href).map((name) => ({ name, source: { url: link.url, pageId: link.pageId, how: "link" as const } })));
  if (!heading && linked[0]) heading = linked[0];
  if (!body && linked.length > 1) body = linked.find((row) => row.name !== heading?.name) ?? null;
  return { heading, body };
}

// --------------------------------------------------------------------------------------- structured data

export type StructuredFacts = { name: string | null; logo: string | null; sameAs: string[]; address: string | null };

/** What the site's own JSON-LD says about the business (Organization, LocalBusiness, Person and kin). */
export function structuredFacts(blocks: string[], base: string): StructuredFacts {
  const out: StructuredFacts = { name: null, logo: null, sameAs: [], address: null };
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 40)) visit(item, depth + 1);
      return;
    }
    const row = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(row["@type"] ?? []).map(String);
    const isBusiness = types.some((type) => /Organization|LocalBusiness|ProfessionalService|Corporation|Person|Brand|Store|Service/i.test(type));
    if (isBusiness) {
      if (!out.name && typeof row.name === "string") out.name = row.name.trim().slice(0, 80) || null;
      const logo = typeof row.logo === "string" ? row.logo : row.logo && typeof row.logo === "object" ? (row.logo as Record<string, unknown>).url : null;
      if (!out.logo && typeof logo === "string") {
        try {
          out.logo = new URL(logo, base).href;
        } catch {
          // A broken address is not a logo.
        }
      }
      for (const link of ([] as unknown[]).concat(row.sameAs ?? [])) if (typeof link === "string" && /^https?:\/\//i.test(link)) out.sameAs.push(link.slice(0, 300));
      const address = row.address;
      if (!out.address && address && typeof address === "object" && !Array.isArray(address)) {
        const a = address as Record<string, unknown>;
        const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter((part) => typeof part === "string" && part.trim()) as string[];
        if (parts.length) out.address = parts.join(", ").slice(0, 200);
      } else if (!out.address && typeof address === "string" && address.trim()) out.address = address.trim().slice(0, 200);
    }
    for (const key of ["@graph", "mainEntity", "publisher", "author", "brand", "provider"]) if (key in row) visit(row[key], depth + 1);
  };
  for (const text of blocks) {
    try {
      visit(JSON.parse(text), 0);
    } catch {
      // A block that is not JSON says nothing.
    }
  }
  out.sameAs = [...new Set(out.sameAs)].slice(0, 12);
  return out;
}

// ------------------------------------------------------------------------------------------------- logo

export type LogoPick = { url: string; from: string; how: "structured data" | "image" | "meta tag" };

/** The logo, in order of trust: structured data, a named image in the header, any named image, the header's first image, the touch icon, the share image. */
export function pickLogo(brand: BrandSignals, structured: StructuredFacts): LogoPick | null {
  if (structured.logo) return { url: structured.logo, from: "Your site's structured data", how: "structured data" };
  const named = brand.logoImages.filter((row) => row.why === "named");
  const inHeader = named.find((row) => row.region === "header" || row.region === "nav");
  if (inHeader) return { url: inHeader.src, from: "The logo in your site's header", how: "image" };
  if (named[0]) return { url: named[0].src, from: "An image your site names as its logo", how: "image" };
  const first = brand.logoImages.find((row) => row.why === "header");
  if (first) return { url: first.src, from: "The first image in your site's header", how: "image" };
  if (brand.icons[0]) return { url: brand.icons[0], from: "Your site's icon", how: "meta tag" };
  if (brand.ogImage) return { url: brand.ogImage, from: "The image your site shares on social media", how: "meta tag" };
  return null;
}

// ------------------------------------------------------------------------------------------------ social

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/i, "Instagram"],
  [/(^|\.)facebook\.com$/i, "Facebook"],
  [/(^|\.)linkedin\.com$/i, "LinkedIn"],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, "YouTube"],
  [/(^|\.)tiktok\.com$/i, "TikTok"],
  [/(^|\.)(twitter\.com|x\.com)$/i, "X"],
  [/(^|\.)pinterest\.com$/i, "Pinterest"],
  [/(^|\.)threads\.net$/i, "Threads"],
];

/** Links to the business's social profiles: from page links and structured data. Share buttons are left out. */
export function socialLinks(pages: { snapshot: PageSnapshot; url: string; pageId: string }[], structured: StructuredFacts) {
  const out: { host: string; url: string }[] = [];
  const sources: FieldSource[] = [];
  const add = (href: string, source: FieldSource) => {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return;
    }
    const match = SOCIAL.find(([pattern]) => pattern.test(url.hostname));
    if (!match) return;
    if (/\/(sharer|share|intent|dialog)\b/i.test(url.pathname) || url.pathname === "/" || url.pathname === "") return;
    if (out.some((row) => row.host === match[1])) return;
    out.push({ host: match[1], url: url.href.slice(0, 300) });
    if (!sources.some((row) => row.url === source.url)) sources.push(source);
  };
  for (const page of pages) for (const link of page.snapshot.links) if (!link.sameSite) add(link.href, { url: page.url, pageId: page.pageId, how: "link" });
  for (const link of structured.sameAs) add(link, { url: pages[0]?.url ?? link, pageId: pages[0]?.pageId ?? null, how: "structured data" });
  return { links: out, sources };
}

/** A site's name from its title, when nothing better says: the part of "Page | Brand" that repeats across pages. */
export function nameFromTitles(titles: string[]): string | null {
  const parts = titles.map((title) => title.split(/\s+[|–—·-]\s+/).map((part) => part.trim()).filter(Boolean));
  if (parts.length === 0 || parts[0].length === 0) return null;
  if (parts.length > 1) {
    for (const candidate of parts[0]) {
      if (parts.every((row) => row.includes(candidate)) && candidate.length <= 60) return candidate;
    }
  }
  const last = parts[0][parts[0].length - 1];
  return parts[0].length > 1 && last.length <= 60 ? last : null;
}
