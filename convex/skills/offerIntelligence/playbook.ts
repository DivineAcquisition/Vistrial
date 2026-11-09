/**
 * The offer playbook: principles of offer building, summarized in Vistrial's own words with credit to the
 * work each comes from. No book text is copied here. Each principle says which channels it suits, what the
 * business needs before it can use it, and what can go wrong.
 *
 * A principle is guidance, never evidence. A change the analysis proposes still needs approved research or
 * the business's own results behind it; the principle only says why the change is shaped the way it is.
 */

import type { Channel } from "./channels";

export type Principle = {
  id: string;
  name: string;
  source: { author: string; work: string };
  /** The idea, in a sentence or two of our own. */
  idea: string;
  /** When it tends to help. */
  useWhen: string;
  /** The channels it suits. An empty list means any channel. */
  channels: readonly Channel[];
  /** What the business must have or be able to do before using it. */
  needs: readonly string[];
  risks: string;
};

const HORMOZI_OFFERS = { author: "Alex Hormozi", work: "$100M Offers" };
const HORMOZI_LEADS = { author: "Alex Hormozi", work: "$100M Leads" };
const BRUNSON = { author: "Russell Brunson", work: "DotCom Secrets" };
const SCHWARTZ = { author: "Eugene Schwartz", work: "Breakthrough Advertising" };
const ABRAHAM = { author: "Jay Abraham", work: "Getting Everything You Can Out of All You've Got" };
const CIALDINI = { author: "Robert Cialdini", work: "Influence" };
const MOESTA = { author: "Bob Moesta", work: "Demand-Side Sales 101" };
const KENNEDY = { author: "Dan Kennedy", work: "The Ultimate Sales Letter" };

export const PLAYBOOK: readonly Principle[] = [
  {
    id: "value-equation",
    name: "Value equation",
    source: HORMOZI_OFFERS,
    idea: "Perceived value rises with the dream outcome and the buyer's belief they will get it, and falls with the wait and the effort it costs them. Improve the offer by raising the first two or cutting the last two, not only by cutting price.",
    useWhen: "The offer competes on price, or buyers hesitate even though the price is fair.",
    channels: [],
    needs: ["A clear outcome the customer wants"],
    risks: "Promising a bigger outcome or a shorter wait than the business can deliver.",
  },
  {
    id: "grand-slam-stack",
    name: "Solve every obstacle, then stack",
    source: HORMOZI_OFFERS,
    idea: "List every problem the buyer meets before, during and after buying, turn each into a part of the offer, then keep the parts that are cheap to deliver and valuable to the buyer. The bundle becomes hard to compare with a competitor's single service.",
    useWhen: "Competitors sell the same commodity service and the business is compared on price.",
    channels: [],
    needs: ["Knowledge of the customer's real obstacles", "Margin to add low-cost, high-value parts"],
    risks: "Adding parts that cost more to deliver than they add in perceived value.",
  },
  {
    id: "commodity-escape",
    name: "Escape the commodity comparison",
    source: HORMOZI_OFFERS,
    idea: "When buyers can line the offer up against identical ones, they pick the cheapest. Change what is being sold (bundle, outcome, delivery) so there is no like-for-like comparison, then price to value.",
    useWhen: "Approved research shows several competitors leading with near-identical offers or price cuts.",
    channels: ["search", "warm", "coldOutreach"],
    needs: ["Something the business can do that competitors do not offer"],
    risks: "A differentiated offer that buyers do not understand in a few seconds.",
  },
  {
    id: "guarantee",
    name: "Risk reversal through a guarantee",
    source: HORMOZI_OFFERS,
    idea: "Take the buyer's risk on yourself: unconditional (money back), conditional (do the steps and get the result or a refund or redo), or a performance guarantee. A stronger, specific guarantee usually lifts conversion more than it raises refunds.",
    useWhen: "Buyers fear a bad result, or competitors offer no clear guarantee.",
    channels: [],
    needs: ["Consistent delivery quality", "Margin to absorb redo or refund costs"],
    risks: "A guarantee the business cannot afford to honour, or vague terms that read as a trick.",
  },
  {
    id: "risk-reversal",
    name: "Better-than-risk-free",
    source: ABRAHAM,
    idea: "Remove the buyer's risk so completely that saying yes is the safe choice, and say so plainly. Most owners already fix complaints quietly; making that promise explicit turns it into a selling point.",
    useWhen: "The business already redoes or refunds unhappy jobs without advertising it.",
    channels: ["search", "warm", "coldOutreach"],
    needs: ["An existing habit of fixing problems for unhappy customers"],
    risks: "Abuse by a few customers; set clear, fair conditions.",
  },
  {
    id: "real-scarcity-urgency",
    name: "Real scarcity and urgency",
    source: HORMOZI_OFFERS,
    idea: "Limits on capacity (only so many slots a week) and real deadlines (seasonal, cohort or price changes) move buyers to act now. They must be true.",
    useWhen: "Buyers are interested but delay; the business has real capacity limits or seasons.",
    channels: ["paidSocial", "search", "warm"],
    needs: ["A genuine capacity limit or date"],
    risks: "Fake countdowns destroy trust and can break consumer-protection rules.",
  },
  {
    id: "bonuses",
    name: "Bonuses that answer objections",
    source: HORMOZI_OFFERS,
    idea: "Each bonus should remove one specific objection and be worth more to the buyer than it costs to give. Name each bonus and say what it is worth.",
    useWhen: "Buyers raise the same few objections, or competitors discount instead of adding value.",
    channels: [],
    needs: ["A list of common objections", "Cheap-to-deliver extras"],
    risks: "Bonuses that look like filler and cheapen the core offer.",
  },
  {
    id: "offer-naming",
    name: "A specific, named offer",
    source: HORMOZI_OFFERS,
    idea: "Give the offer a name that says who it is for, the result, the time frame and the format, with a reason it exists now. A named, specific offer reads as new even to people who know the market.",
    useWhen: "The offer reads as a generic service, or ads fatigue quickly.",
    channels: ["paidSocial", "content", "search"],
    needs: ["A clear audience and result"],
    risks: "Clever names that hide what is actually sold.",
  },
  {
    id: "lead-magnet",
    name: "Lead magnet: solve one narrow problem free",
    source: HORMOZI_LEADS,
    idea: "Give away something that fully solves one small problem and reveals the next, bigger one the paid offer solves: a quote, an audit, a checklist, a sample.",
    useWhen: "Cold audiences will not buy on first contact; the sale needs trust first.",
    channels: ["paidSocial", "content", "coldOutreach"],
    needs: ["A follow-up process to turn leads into sales"],
    risks: "Leads who only want the free thing; qualify them.",
  },
  {
    id: "core-four-fit",
    name: "Match the offer to the channel",
    source: HORMOZI_LEADS,
    idea: "Warm outreach, content, cold outreach and paid ads reach people at different temperatures. Warm audiences can take a direct offer; cold ones usually need a lower-commitment first step.",
    useWhen: "The same offer is used on every channel, or one channel underperforms the others.",
    channels: [],
    needs: ["Knowing which channels bring customers today"],
    risks: "Spreading effort over channels the business cannot run well.",
  },
  {
    id: "value-ladder",
    name: "Value ladder",
    source: BRUNSON,
    idea: "Lay out offers from a low-commitment entry point to higher-value ones, so a first purchase leads naturally to the next. The entry offer's job is to start the relationship, not to make all the profit.",
    useWhen: "Customers buy once and leave, or the main offer is too big a first step.",
    channels: ["paidSocial", "content", "warm"],
    needs: ["A real next offer to move customers up to"],
    risks: "An entry offer so cheap it attracts buyers who never move up.",
  },
  {
    id: "self-liquidating-entry",
    name: "Entry offer that pays for the ads",
    source: BRUNSON,
    idea: "For paid traffic, a small first purchase that covers the ad cost lets the business buy customers at break-even and profit on what they buy next.",
    useWhen: "Paid social leads are expensive and the business has a follow-on service.",
    channels: ["paidSocial"],
    needs: ["Its own ad results to know the cost per customer", "A follow-on offer"],
    risks: "Break-even on the front end with no back end means losing money at scale.",
  },
  {
    id: "hook-story-offer",
    name: "Hook, story, offer",
    source: BRUNSON,
    idea: "On attention-driven channels, the offer only gets seen if a hook stops the scroll and a short story makes the offer believable before it is stated.",
    useWhen: "Ads or posts get low engagement even though the offer is good.",
    channels: ["paidSocial", "content"],
    needs: ["A real customer story or before-and-after"],
    risks: "A strong hook attached to a weak or mismatched offer.",
  },
  {
    id: "awareness-match",
    name: "Match the offer to the buyer's awareness",
    source: SCHWARTZ,
    idea: "Buyers range from unaware of the problem to ready to buy. Someone searching for the service is already aware and wants proof and a reason to choose; a cold scroller needs the problem named first.",
    useWhen: "Choosing what to lead with on a given channel.",
    channels: [],
    needs: [],
    risks: "Leading with price to people who do not yet see the problem.",
  },
  {
    id: "market-sophistication",
    name: "Stand out in a crowded market",
    source: SCHWARTZ,
    idea: "When every competitor makes the same claim, repeating it louder stops working. Make a new, more specific claim, or show the mechanism behind the result.",
    useWhen: "Approved research shows many competitors with the same promise (for example, \"20% off your first clean\").",
    channels: ["paidSocial", "search", "content"],
    needs: ["A real difference in method or result"],
    risks: "A new mechanism that is just jargon.",
  },
  {
    id: "social-proof",
    name: "Proof that people like me chose this",
    source: CIALDINI,
    idea: "Buyers lean on what similar people did. Specific reviews, numbers and local customers lower perceived risk, especially for cold audiences.",
    useWhen: "The business has good reviews or results that the offer does not show.",
    channels: ["paidSocial", "search", "content", "coldOutreach"],
    needs: ["Real reviews or results the business may use"],
    risks: "Generic or unverifiable testimonials.",
  },
  {
    id: "reciprocity",
    name: "Give first",
    source: CIALDINI,
    idea: "Giving something useful before asking makes people more willing to say yes later. This is the logic behind free audits, guides and samples.",
    useWhen: "Cold outreach or content needs a reason for people to engage.",
    channels: ["content", "coldOutreach"],
    needs: ["Something useful to give that costs little"],
    risks: "Giving away the paid service itself.",
  },
  {
    id: "referral-system",
    name: "A referral system, not a hope",
    source: ABRAHAM,
    idea: "Most happy customers would refer if asked at the right moment and given an easy way and a reason. Build the ask and the reward into the offer.",
    useWhen: "Past customers are happy and referrals happen only by chance.",
    channels: ["warm"],
    needs: ["Happy past customers", "A way to track referrals"],
    risks: "Rewards that feel like bribes, or asking before the job is done well.",
  },
  {
    id: "jobs-to-be-done",
    name: "Sell the progress, not the service",
    source: MOESTA,
    idea: "People buy when a struggling moment pushes them to make progress. Frame the offer around that moment (moving out, hosting guests, a new baby) and the progress they want.",
    useWhen: "The offer describes the service but not the situation that makes people buy it.",
    channels: ["search", "warm", "content"],
    needs: ["Knowing why customers bought, in their words"],
    risks: "Guessing the moment instead of asking customers.",
  },
  {
    id: "reason-why-deadline",
    name: "Reason why and a deadline",
    source: KENNEDY,
    idea: "An offer with a believable reason it exists (a slow season, a new crew, an anniversary) and a clear end date gets acted on; a standing discount gets ignored.",
    useWhen: "Discounts run all the time and stop working.",
    channels: ["paidSocial", "warm", "coldOutreach"],
    needs: ["A true reason", "Willingness to end the offer on the date"],
    risks: "Extending the deadline teaches buyers to wait.",
  },
];

export const PRINCIPLE_IDS = new Set(PLAYBOOK.map((row) => row.id));

export function principle(id: string) {
  return PLAYBOOK.find((row) => row.id === id) ?? null;
}

/** True when a principle may be applied on a channel. */
export function principleFits(id: string, channel: Channel) {
  const row = principle(id);
  return row !== null && (row.channels.length === 0 || row.channels.includes(channel));
}

export function credit(row: Principle) {
  return `${row.source.author}, ${row.source.work}`;
}
