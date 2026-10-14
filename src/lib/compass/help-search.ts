/**
 * Finds the help articles that answer a product question. Compass answers
 * "how do I" and "what does this mean" only from these articles; when none
 * fits, it says so and offers to contact the team.
 */

export type HelpArticle = {
  slug: string;
  topic: string;
  question: string;
  body: string;
  linkLabel: string | null;
  linkHref: string | null;
};

const STOP = new Set(
  "a an the and or but if of to in on at for with from by is are was were be been do does did how what why when where who which can i we you my our your it this that there their about into than then so not no yes me us".split(
    " "
  )
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/(ies|es|s)$/, (end) => (end === "ies" ? "y" : "")))
    .filter((word) => word.length > 2 && !STOP.has(word));
}

export function scoreArticle(question: string, article: HelpArticle): number {
  const asked = new Set(words(question));
  if (!asked.size) return 0;
  const title = words(article.question);
  const body = words(article.body);
  let score = 0;
  for (const word of asked) {
    if (title.includes(word)) score += 3;
    else if (body.includes(word)) score += 1;
  }
  return score / Math.sqrt(asked.size);
}

/** The best matches above a floor; empty when nothing fits well enough to answer from. */
export function searchHelp(question: string, articles: HelpArticle[], limit = 3): Array<HelpArticle & { score: number }> {
  return articles
    .map((article) => ({ ...article, score: scoreArticle(question, article) }))
    .filter((article) => article.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
