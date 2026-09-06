"use client";

import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ } from "@/lib/marketing/copy";
import { marketingBody } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export function LandingFaq() {
  return (
    <Accordion className="mx-auto w-full max-w-3xl rounded-2xl border border-white/[0.08] bg-ink-900/60 px-5 sm:px-8">
      {FAQ.items.map((item, index) => (
        <AccordionItem key={item.q} value={`faq-${index}`} className="border-white/[0.08]">
          <AccordionTrigger className="py-5 font-display text-base text-white sm:text-lg">
            {item.q}
          </AccordionTrigger>
          <AccordionPanel className={cn(marketingBody, "text-silver")}>{item.a}</AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
