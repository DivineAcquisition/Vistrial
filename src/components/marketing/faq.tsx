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
    <Accordion className="mx-auto w-full max-w-3xl rounded-xl border border-[#8a86a3] bg-[#1c1a27] px-5 sm:px-8">
      {FAQ.items.map((item, index) => (
        <AccordionItem key={item.q} value={`faq-${index}`} className="border-[#6b6784]">
          <AccordionTrigger className="py-5 font-heading text-base text-white sm:text-lg">
            {item.q}
          </AccordionTrigger>
          <AccordionPanel className={cn(marketingBody, "text-silver")}>{item.a}</AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
