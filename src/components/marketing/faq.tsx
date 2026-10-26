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
    <Accordion className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card px-5 sm:px-8">
      {FAQ.items.map((item, index) => (
        <AccordionItem key={item.q} value={`faq-${index}`} className="border-border">
          <AccordionTrigger className="py-5 font-heading text-base text-strong sm:text-lg">
            {item.q}
          </AccordionTrigger>
          <AccordionPanel className={cn(marketingBody, "text-muted-foreground")}>{item.a}</AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
