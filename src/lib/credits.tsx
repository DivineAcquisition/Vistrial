"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_MARKUP, creditCount, creditWords, creditsForCost, dollarWords, wholeCredits } from "../../convex/lib/credits";

export { creditCount, creditWords, dollarWords, wholeCredits };

/** The markup this deployment charges, from the server. Screens outside the app frame use the default. */
const MarkupContext = createContext<number>(DEFAULT_MARKUP);

export function CreditsProvider({ markup, children }: { markup: number | undefined; children: ReactNode }) {
  return <MarkupContext.Provider value={markup && markup >= 1 ? markup : DEFAULT_MARKUP}>{children}</MarkupContext.Provider>;
}

/**
 * How every screen writes a credit amount.
 *   words(n)  an amount that is already credits: a balance, a price, a pack.
 *   cost(c)   what a piece of work cost to run, turned into the credits charged for it (cost × markup).
 * count and costCount give the number alone, for places that say "credits" themselves.
 */
export function useCredits() {
  const markup = useContext(MarkupContext);
  return useMemo(
    () => ({
      markup,
      words: (credits: number) => creditWords(credits),
      count: (credits: number) => creditCount(credits),
      cost: (costCents: number) => creditWords(creditsForCost(costCents, markup)),
      costCount: (costCents: number) => creditCount(creditsForCost(costCents, markup)),
      /** The whole credits charged for this cost, for inputs and sums. */
      ofCost: (costCents: number) => wholeCredits(creditsForCost(costCents, markup)),
      /** The cost a number of credits allows, for saving a limit typed in credits. */
      toCost: (credits: number) => credits / markup,
    }),
    [markup],
  );
}
