/**
 * A long briefing post, split into the parts it already has. The weekly growth report is written in code as a
 * summary, then titled lists ("What finished", then "• " lines), then a closing note. This reads that shape
 * back so the screen can show each list's title and count and keep its lines one step away. It adds no words:
 * a body that is not in this shape comes back as plain paragraphs.
 */
export type PostSection = { title: string; items: string[]; /** The line a list carries when it is empty ("None."). */ note: string };
export type PostParts = { lead: string[]; sections: PostSection[]; tail: string[] };

const BULLET = /^\s*[•\-*]\s+/;

export function splitPost(body: string): PostParts {
  const blocks = body
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);
  const lead: string[] = [];
  const sections: PostSection[] = [];
  const tail: string[] = [];
  for (const lines of blocks) {
    const [first, ...rest] = lines;
    const titled = !BULLET.test(first) && first.length <= 60 && !/[.:!?]$/.test(first) && rest.length > 0;
    if (titled && rest.every((line) => BULLET.test(line))) sections.push({ title: first, items: rest.map((line) => line.replace(BULLET, "")), note: "" });
    else if (titled && rest.length === 1) sections.push({ title: first, items: [], note: rest[0] });
    else (sections.length === 0 ? lead : tail).push(lines.join(" "));
  }
  return { lead, sections, tail };
}

/** Whether text is long enough to fold. Counted in characters and lines, so a short list is never folded. */
export function isLong(text: string, limit = 240): boolean {
  return text.length > limit || text.split("\n").length > 4;
}
