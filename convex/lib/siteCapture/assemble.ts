/**
 * Puts a capture together from what was read: the brand found in code, the words the model quoted and code
 * checked, and the pages. Pure. Where nothing on the site supports a field, the field is "missing".
 */
import type { PageSnapshot } from "../pageReader/extract";
import { brandColors, brandFonts, nameFromTitles, socialLinks, structuredFacts, type CssSource } from "./brand";
import { emptyResult, found, type CaptureResult, type CapturedPage } from "./fields";
import type { WordsResult } from "./words";

export type ReadPage = CapturedPage & { snapshot: PageSnapshot | null };

export type AssembleInput = {
  pages: ReadPage[];
  /** The text of the site's own stylesheets the capture fetched, with the page that linked each. */
  stylesheets: { url: string; css: string; pageId: string | null }[];
  logo: { url: string; storageId: string | null; from: string; how: "structured data" | "image" | "meta tag" } | null;
  words: WordsResult | null;
};

export function readPages(pages: ReadPage[]) {
  return pages.filter((page): page is ReadPage & { snapshot: PageSnapshot } => page.read && page.snapshot !== null);
}

/** Everything structured data says, across the pages read (the home page first). */
export function structuredOf(pages: ReadPage[]) {
  const read = readPages(pages);
  return structuredFacts(read.flatMap((page) => page.snapshot.brand?.jsonLd ?? []), read[0]?.url ?? "https://example.invalid/");
}

export function assemble(input: AssembleInput): CaptureResult {
  const result = emptyResult();
  const read = readPages(input.pages);
  result.pages = input.pages.map((page) => ({ id: page.id, url: page.url, kind: page.kind, title: page.title, read: page.read, reason: page.reason }));
  if (read.length === 0) return result;
  const home = read[0];
  const structured = structuredOf(input.pages);

  // Name: structured data, then the words step (quoted), then the part of the titles every page shares.
  if (structured.name) result.name = found(structured.name, [{ url: home.url, pageId: home.id, how: "structured data" }]);
  else if (input.words?.name.value) result.name = input.words.name;
  else {
    const fromTitles = nameFromTitles(read.map((page) => page.snapshot.title).filter(Boolean));
    if (fromTitles) result.name = found(fromTitles, [{ url: home.url, pageId: home.id, how: "meta tag", quote: home.snapshot.title }]);
  }

  // Colours and fonts: the theme colour, inline styles on every page, and the stylesheets fetched.
  const sheets: CssSource[] = [
    ...read.map((page) => ({ css: page.snapshot.brand?.css ?? "", url: page.url, pageId: page.id, how: "page text" as const })),
    ...input.stylesheets.map((sheet) => ({ css: sheet.css, url: sheet.url, pageId: sheet.pageId, how: "stylesheet" as const })),
  ];
  const themed = read.find((page) => page.snapshot.brand?.themeColor);
  const colors = brandColors({ value: themed?.snapshot.brand?.themeColor ?? null, url: themed?.url ?? home.url, pageId: themed?.id ?? home.id }, sheets);
  result.colors = found(colors.colors, colors.sources);
  const fontLinks = read.flatMap((page) => (page.snapshot.brand?.fontLinks ?? []).map((href) => ({ href, url: page.url, pageId: page.id })));
  const fonts = brandFonts(fontLinks, sheets);
  if (fonts.heading) result.headingFont = found(fonts.heading.name, [fonts.heading.source]);
  if (fonts.body) result.bodyFont = found(fonts.body.name, [fonts.body.source]);

  if (input.logo) {
    result.logo = found({ url: input.logo.url, storageId: input.logo.storageId, from: input.logo.from }, [{ url: input.logo.url, pageId: home.id, how: input.logo.how }]);
  }

  const social = socialLinks(read.map((page) => ({ snapshot: page.snapshot, url: page.url, pageId: page.id })), structured);
  result.social = found(social.links, social.sources);

  if (structured.address) result.location = found(structured.address, [{ url: home.url, pageId: home.id, how: "structured data" }]);
  else if (input.words?.location.value) result.location = input.words.location;

  if (input.words) {
    result.tone = input.words.tone;
    result.audience = input.words.audience;
    result.offers = input.words.offers;
    result.proof = input.words.proof;
    result.guarantees = input.words.guarantees;
    result.dropped = input.words.dropped;
  }
  return result;
}
