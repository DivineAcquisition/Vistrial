"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { helperClass } from "@/lib/ui";

export type HelpArticleView = { slug: string; question: string; body: string; linkLabel: string | null; linkHref: string | null };

/** How the product works, one question at a time. A link to /app/help#slug opens that answer. */
export function HelpArticles({ articles }: { articles: HelpArticleView[] }) {
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    const show = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      if (!slug || !articles.some((article) => article.slug === slug)) return;
      setOpen([slug]);
      document.getElementById(slug)?.scrollIntoView({ block: "start" });
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, [articles]);

  return (
    <Accordion value={open} onValueChange={(value) => setOpen(value as string[])}>
      {articles.map((article) => (
        <AccordionItem key={article.slug} value={article.slug} id={article.slug} className="scroll-mt-24">
          <AccordionTrigger>{article.question}</AccordionTrigger>
          <AccordionPanel>
            <div className="space-y-2">
              {article.body.split(/\n{2,}/).map((line) => (
                <p key={line} className={helperClass}>
                  {line}
                </p>
              ))}
              {article.linkHref && article.linkHref.startsWith("/app/") ? (
                <Link href={article.linkHref} className="text-sm text-brand-300 underline">
                  {article.linkLabel ?? "Open"}
                </Link>
              ) : null}
            </div>
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
