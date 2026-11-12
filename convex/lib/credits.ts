/**
 * How a credit amount is written, everywhere: screens, messages and emails. One credit is one cent of
 * balance (PLAN.includedCents 15000 is 15,000 credits), so a stored "cents" amount of balance or price
 * is already a number of credits. Money that is really charged to a card stays in dollars: dollarWords.
 *
 * Fractions. Credits are whole numbers. Every charge is rounded up to the next whole credit (priceFor in
 * billing.ts), so the smallest charge is 1 credit, and an amount shown here rounds up the same way. Only
 * an amount that is more than nothing and less than one credit, such as an estimate, reads "under 1 credit".
 */

/** What the customer pays for a piece of AI work, as a multiple of what it cost. BILLING_MARKUP overrides it on a deployment. */
export const DEFAULT_MARKUP = 3;

/** What a Thorough research session usually costs to run, in cents of cost. Screens turn it into credits. */
export const TYPICAL_RESEARCH_COST_CENTS: [number, number] = [60, 150];

/** A credit amount as the whole number that is shown and charged: rounded up, never below zero. */
export function wholeCredits(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  // 42 × 3 can arrive as 126.00000000000001; that is 126 credits, not 127.
  return Math.ceil(Math.round(amount * 1e6) / 1e6);
}

/** The markup on this deployment. On a server it reads BILLING_MARKUP; a screen is given it by the server. */
export function markup(): number {
  const value = Number((typeof process !== "undefined" ? process.env.BILLING_MARKUP : undefined) ?? DEFAULT_MARKUP);
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_MARKUP;
}

/** The credits charged for one piece of work that cost this much: rounded up to a whole credit. */
export function priceFor(costCents: number, factor = markup()): number {
  return costCents > 0 ? wholeCredits(costCents * factor) : 0;
}

/** The credits charged for work that cost this much: cost × markup. Not rounded; creditWords rounds it. */
export function creditsForCost(costCents: number, markup: number = DEFAULT_MARKUP): number {
  return costCents > 0 ? costCents * markup : 0;
}

/** Just the number: "15,000", "1", "0", "under 1". A balance below zero reads "-120". */
export function creditCount(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  if (amount < 0) return `-${wholeCredits(-amount).toLocaleString("en-US")}`;
  if (amount > 0 && amount < 1) return "under 1";
  return wholeCredits(amount).toLocaleString("en-US");
}

/** The number with its word: "15,000 credits", "1 credit", "under 1 credit", "0 credits". */
export function creditWords(amount: number): string {
  const one = (amount > 0 && amount < 1) || wholeCredits(amount) === 1;
  return `${creditCount(amount)} ${one ? "credit" : "credits"}`;
}

/** Money that is charged to a card: "$179", "$9.50". Never used for a credit amount. */
export function dollarWords(cents: number): string {
  if (cents > 0 && cents < 0.5) return "under $0.01";
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(cents));
  const whole = absolute % 100 === 0;
  return `${sign}$${(absolute / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
