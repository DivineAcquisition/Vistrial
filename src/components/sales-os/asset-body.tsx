"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function AssetBody({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-card-foreground prose-headings:font-heading prose-headings:text-card-foreground prose-h2:mt-5 prose-h2:mb-2 prose-h2:text-base prose-p:my-2 prose-blockquote:border-brand-500/50 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-card-foreground prose-strong:text-card-foreground",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
