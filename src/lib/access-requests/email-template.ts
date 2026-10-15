const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Only the person's name may be inserted. Any other placeholder refuses the send. */
export function renderRequestEmail(template: string, name: string): string | null {
  const found = [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
  if (found.some((token) => token !== "name")) return null;
  const safe = name.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  return template.replace(PLACEHOLDER, safe);
}

export function emailHasOnlyFixedText(rendered: string, name: string, template: string): boolean {
  const expected = renderRequestEmail(template, name);
  return expected !== null && rendered === expected && !rendered.includes("{{");
}
