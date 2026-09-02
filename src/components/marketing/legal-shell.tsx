import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { MarketingShell } from "@/components/marketing/chrome";
import { AnimatedHeading } from "@/components/ui/animated-heading";
import { marketingHeroTitle } from "@/lib/marketing/ui";

export function LegalShell({
  title,
  description,
  updated,
  effective,
  children,
}: {
  title: string;
  description?: string;
  updated?: string;
  effective?: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell headerAction="none">
      <article className="px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <AnimatedHeading as="h1" className={`${marketingHeroTitle} text-[2.2rem] sm:text-4xl`}>
            {title}
          </AnimatedHeading>
          {updated || effective ? (
            <p className="mt-4 text-sm leading-relaxed text-silver">
              {updated ? (
                <>
                  <strong className="font-semibold text-white">Last updated:</strong> {updated}
                </>
              ) : null}
              {updated && effective ? <br /> : null}
              {effective ? (
                <>
                  <strong className="font-semibold text-white">Effective:</strong> {effective}
                </>
              ) : null}
            </p>
          ) : description ? (
            <p className="mt-4 text-sm leading-relaxed text-silver">{description}</p>
          ) : null}
          <div className="mt-8 text-[15px] leading-relaxed text-silver [&>p+p]:mt-4 [&>section]:mt-10 [&_strong]:font-semibold [&_strong]:text-white">
            {children}
          </div>
        </div>
      </article>
    </MarketingShell>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-heading text-[1.35rem] tracking-tight text-white sm:text-[1.45rem]">{heading}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

const legalLinkClass =
  "text-brand-300 underline-offset-4 hover:text-white hover:underline";

export function LegalMail({ email }: { email: string }) {
  return (
    <a className={legalLinkClass} href={`mailto:${email}`}>
      {email}
    </a>
  );
}

export function LegalHref({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={legalLinkClass}>
      {children}
    </Link>
  );
}

export function LegalTable({
  headers,
  rows,
}: {
  headers: [string, string];
  rows: Array<[ReactNode, ReactNode]>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-[14px] leading-relaxed">
        <thead>
          <tr className="border-b border-white/[0.08]">
            <th scope="col" className="py-2 pr-6 font-semibold text-white">
              {headers[0]}
            </th>
            <th scope="col" className="py-2 font-semibold text-white">
              {headers[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-white/[0.06] align-top">
              <th scope="row" className="py-2.5 pr-6 font-medium text-white">
                {row[0]}
              </th>
              <td className="py-2.5 text-silver">{row[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function legalMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
  };
}
