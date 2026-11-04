import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BlurFade } from "@/components/ui/blur-fade";
import { SectionEyebrow } from "@/components/marketing/growth-visuals";
import { PHILOSOPHY } from "@/lib/marketing/content";
import { marketingLead, marketingPageGutter, marketingSectionTitle, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/**
 * The idea Vistrial grew from, shown as a marble philosopher in a dark study.
 *
 * The public site is locked to the light theme, where the ink and brand scales
 * are remapped. The portrait panel uses literal colors so it stays dark and the
 * white marble reads.
 */
function PhilosopherPortrait() {
  const { image, maxim } = PHILOSOPHY;
  return (
    <figure className="flex flex-col gap-3">
      <div className="relative isolate aspect-[4/5] overflow-hidden rounded-2xl border border-[#9a88fc]/20 bg-[#07070b] shadow-[0_40px_80px_-40px_rgba(30,25,64,0.75)]">
        {/* Light from above, and a violet halo behind the head. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(62%_46%_at_50%_34%,rgba(154,136,252,0.62),rgba(102,80,216,0.22)_50%,transparent_78%)]"
        />
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/3 bg-gradient-to-b from-white/[0.06] to-transparent" />

        {/* Concentric rings: the field of view the philosopher studies. */}
        <svg
          aria-hidden
          viewBox="0 0 400 500"
          className="absolute inset-0 -z-10 h-full w-full motion-safe:animate-[spin_120s_linear_infinite] [transform-origin:50%_34%]"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" stroke="#c3b6fe">
            <circle cx="200" cy="170" r="118" strokeOpacity="0.22" />
            <circle cx="200" cy="170" r="158" strokeOpacity="0.14" strokeDasharray="2 6" />
            <circle cx="200" cy="170" r="204" strokeOpacity="0.09" />
            <circle cx="200" cy="170" r="256" strokeOpacity="0.06" strokeDasharray="1 9" />
          </g>
          <g fill="#c3b6fe">
            <circle cx="318" cy="170" r="2.5" fillOpacity="0.7" />
            <circle cx="88" cy="226" r="2" fillOpacity="0.45" />
            <circle cx="200" cy="-34" r="2" fillOpacity="0.35" />
          </g>
        </svg>

        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt={image.alt}
          sizes="(min-width: 1024px) 440px, (min-width: 640px) 60vw, 90vw"
          className="absolute inset-x-0 bottom-0 mx-auto h-[94%] w-auto max-w-none object-contain object-bottom drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)] [mask-image:linear-gradient(to_bottom,black_72%,transparent_98%)]"
        />

        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#07070b] via-[#07070b]/70 to-transparent" />

        <p className="absolute inset-x-0 bottom-0 px-6 pb-6 font-heading text-lg leading-snug tracking-tight text-[#f4f3fa] sm:text-xl">
          <span className="mb-2 block text-[11px] font-semibold tracking-[0.16em] text-[#c3b6fe] uppercase">What fueled Vistrial</span>
          {maxim}
        </p>
      </div>
      <figcaption className="text-xs leading-relaxed text-muted-foreground">{image.credit}</figcaption>
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
