import Link from "next/link";

import {
  privacyDates,
  privacyPolicySections,
  type PolicyBlock,
} from "@/lib/trust/privacy-policy";
import type { TrustPublic } from "@/lib/trust/model";
import { marketingHeroTitle } from "@/lib/marketing/ui";

const TOKEN = /(\/(?:privacy|security|terms)(?:\/[a-z-]+)?|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

function RichText({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("/")) {
          return (
            <Link key={`${part}-${index}`} href={part} className="text-brand-300 underline">
              {part}
            </Link>
          );
        }
        if (part.includes("@")) {
          return (
            <a key={`${part}-${index}`} href={`mailto:${part}`} className="text-brand-300 underline">
              {part}
            </a>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function BlockView({ block }: { block: PolicyBlock }) {
  if (block.kind === "h") {
    return <h3 className="pt-2 font-heading text-base text-white">{block.text}</h3>;
  }
  if (block.kind === "ul") {
    return (
      <ul className="list-disc space-y-2 pl-5">
        {block.items.map((item) => (
          <li key={item}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === "note") {
    return (
      <p className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-white">
        <RichText text={block.text} />
      </p>
    );
  }
  return (
    <p>
      <RichText text={block.text} />
    </p>
  );
}

export function PrivacyPolicy({ trust }: { trust: TrustPublic }) {
  const dates = privacyDates(trust);
  const sections = privacyPolicySections(trust);
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
      {trust.privacyLive ? null : (
        <p className="rounded-2xl border border-white/10 px-4 py-3 text-sm leading-relaxed text-white">
          Draft for review by qualified counsel. Not legal advice. This page is not in effect until a Platform Admin approves it and a mailing address is on file.
        </p>
      )}
      <h1 className={`${marketingHeroTitle} mt-8 text-[2.1rem] sm:text-4xl`}>Privacy Policy</h1>
      <p className="mt-3 text-sm text-dim">Last updated: {dates.updated}</p>
      <p className="mt-1 text-sm text-dim">Effective: {dates.effective}</p>
      <p className="mt-6 text-sm leading-relaxed text-silver sm:text-[15px]">
        This policy explains what information Vistrial collects, why we collect it, who we share it with, how long we keep it, and what choices you have.
      </p>
      <nav aria-label="Contents" className="mt-8">
        <h2 className="font-heading text-lg text-white">Contents</h2>
        <ol className="mt-3 grid gap-2 text-sm">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-silver hover:text-white">
                {section.number}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="mt-10 space-y-10 text-sm leading-relaxed text-silver sm:text-[15px]">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3">
            <h2 className="font-heading text-xl tracking-tight text-white">
              {section.number}. {section.title}
            </h2>
            {section.blocks.map((block, index) => (
              <BlockView key={`${section.id}-${index}`} block={block} />
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
