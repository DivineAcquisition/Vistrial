"use client";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { INDUSTRIES } from "@/lib/marketing/content";
import { marketingPanel } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export function IndustrySwitcher() {
  return (
    <Tabs defaultValue={INDUSTRIES.cards[0].id}>
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border bg-muted p-1">
        {INDUSTRIES.cards.map((card) => (
          <TabsTab
            key={card.id}
            value={card.id}
            className="rounded-md px-3 py-2 text-muted-foreground data-active:border data-active:border-border data-active:bg-card data-active:text-strong"
          >
            {card.title}
          </TabsTab>
        ))}
      </TabsList>
      {INDUSTRIES.cards.map((card) => (
        <TabsPanel key={card.id} value={card.id} className="mt-4">
          <div className={cn(marketingPanel, "grid gap-6 p-5 lg:grid-cols-[0.8fr_1.2fr]")}>
            <div>
              <h3 className="font-heading text-2xl text-strong">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.motion}</p>
            </div>
            <ul className="space-y-2">
              {card.watches.map((item, index) => (
                <li
                  key={item}
                  className="animate-vistrial-highlight rounded-md border border-border bg-muted px-3 py-3 text-sm text-strong motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 0.4}s` }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </TabsPanel>
      ))}
    </Tabs>
  );
}
