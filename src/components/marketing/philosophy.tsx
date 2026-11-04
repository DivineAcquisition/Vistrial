import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BlurFade } from "@/components/ui/blur-fade";
import { SectionEyebrow } from "@/components/marketing/growth-visuals";
import { PHILOSOPHY } from "@/lib/marketing/content";
import { marketingLead, marketingPageGutter, marketingSectionTitle, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/**
 * The idea Vistrial grew from: a black-and-white ink drawing of a philosopher,
 * cut out with no background so it sits straight on the page.
 */
function PhilosopherPortrait() {
  const { image, maxim } = PHILOSOPHY;
  return (
    <figure className="flex flex-col items-center gap-6 lg:items-start">
      <Image
        src={image.src}
        width={image.width}
        height={image.height}
        alt={image.alt}
        sizes="(min-width: 1024px) 320px, (min-width: 640px) 280px, 62vw"
        className="h-auto w-[62%] max-w-[320px] sm:w-[280px] lg:w-[320px]"
      />
      <figcaption className="w-full max-w-[360px] text-center lg:text-left">
        <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.16em] text-brand-200 uppercase">What fueled Vistrial</span>
        <span className="block font-heading text-lg leading-snug tracking-tight text-strong sm:text-xl">{maxim}</span>
        <span className="mt-3 block text-xs leading-relaxed text-muted-foreground">{image.credit}</span>
      </figcaption>
    </figure>
  );
}

export function PhilosophySection() {
  return (
    <section id={PHILOSOPHY.id} className={cn(marketingPageGutter, "scroll-mt-24 border-t border-border py-20 sm:py-28")}>
      <BlurFade inView offset={12} blur="2px" duration={0.55} className={marketingShell}>
        <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <PhilosopherPortrait />
          </div>
          <div>
            <SectionEyebrow>{PHILOSOPHY.eyebrow}</SectionEyebrow>
            <h2 className={marketingSectionTitle}>{PHILOSOPHY.headline}</h2>
            <div className="mt-5 space-y-4">
              {PHILOSOPHY.paragraphs.map((paragraph) => (
                <p key={paragraph} className={marketingLead}>
                  {paragraph}
                </p>
              ))}
            </div>
            <ol className="mt-8 grid gap-x-6 gap-y-5 border-t border-border pt-8 sm:grid-cols-2">
              {PHILOSOPHY.tenets.map((tenet, index) => (
                <li key={tenet.id} className="flex gap-3">
                  <span className="mt-0.5 font-heading text-sm text-brand-500 tabular-nums" aria-hidden>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-heading text-base text-strong">{tenet.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tenet.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8">
              <Link
                href={PHILOSOPHY.link.href}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 underline-offset-4 hover:underline"
              >
                {PHILOSOPHY.link.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </p>
          </div>
        </div>
      </BlurFade>
    </section>
  );
}
