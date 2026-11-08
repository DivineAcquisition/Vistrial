import { Fragment, type ReactNode } from "react";

/**
 * Renders the small Markdown subset our reports are written in: headings (#, ##, ###), "- " lists,
 * **bold**, _italic_, and paragraphs. It builds React elements only and never sets HTML, so text from a
 * source or a model cannot inject markup or scripts.
 */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    parts.push(
      token.startsWith("**") ? (
        <strong key={key++} className="font-semibold text-card-foreground">
          {token.slice(2, -2)}
        </strong>
      ) : (
        <em key={key++}>{token.slice(1, -1)}</em>
      ),
    );
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ReportBody({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="grid list-disc gap-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(<p key={`p-${blocks.length}`}>{inline(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList();
      flushParagraph();
      const level = heading[1].length;
      const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      const size = level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base";
      blocks.push(
        <Tag key={`h-${blocks.length}`} className={`font-heading ${size} pt-2 text-card-foreground`}>
          {inline(heading[2])}
        </Tag>,
      );
    } else if (/^\s*-\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^\s*-\s+/, ""));
    } else if (line.trim() === "") {
      flushList();
      flushParagraph();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushList();
  flushParagraph();
  return <div className="grid gap-3 text-sm leading-relaxed break-words text-card-foreground">{blocks.map((block, i) => <Fragment key={i}>{block}</Fragment>)}</div>;
}

/** The report as a Markdown file: the body, then every source its claims cite, with links. */
export function reportMarkdown(title: string, version: number, body: string, evidence: { statement?: string | null; claimKey: string; basisLabel?: string | null; sources?: { title: string; url: string; publisher: string | null }[] }[]) {
  const sources = new Map<string, { title: string; publisher: string | null }>();
  for (const claim of evidence) for (const source of claim.sources ?? []) sources.set(source.url, { title: source.title, publisher: source.publisher });
  const lines = [`<!-- ${title}, version ${version}. Exported from Vistrial. -->`, "", body.trim(), "", "## Claims and their basis", ""];
  for (const claim of evidence) lines.push(`- ${claim.basisLabel ? `**${claim.basisLabel}:** ` : ""}${claim.statement ?? claim.claimKey}`);
  if (sources.size > 0) {
    lines.push("", "## Sources", "");
    for (const [url, source] of sources) lines.push(`- [${source.title.replace(/[[\]]/g, "")}](${url})${source.publisher ? `, ${source.publisher}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}
