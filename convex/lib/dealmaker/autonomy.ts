/**
 * How much Dealmaker may do on its own (docs/rebuild/dealmaker.md, 0.2, under doctrine IV). Pure: the server,
 * the screens and the tests read the same rules.
 *
 * Anything that talks to a lead waits for a person by default. The Owner may make only the low-stakes kinds
 * autonomous: reminders, confirmations and delivering something already promised. Anything that persuades,
 * prices, re-engages or closes always waits. Four hard stops hold whatever is autonomous: a price, the first
 * message to a lead, marking a deal won or lost, and a lead who replied negatively (everything for that lead
 * pauses until a person lifts the pause).
 */

export const MESSAGE_KINDS = ["reminder", "confirmation", "deliverPromised", "answer", "followUp", "checkIn", "price", "close", "firstMessage"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  reminder: "Call reminders",
  confirmation: "Booking confirmations",
  deliverPromised: "Sending something already promised",
  answer: "Answering a lead's question",
  followUp: "Following up after a call",
  checkIn: "Asking whether more contact is welcome",
  price: "Anything with a price",
  close: "Asking for the decision",
  firstMessage: "The first message to a new lead",
};

/** The only kinds the Owner may let Dealmaker send without asking. */
export const LOW_STAKES: readonly MessageKind[] = ["reminder", "confirmation", "deliverPromised"];

export function canBeAutonomous(kind: MessageKind) {
  return LOW_STAKES.includes(kind);
}

export type SendContext = {
  kind: MessageKind;
  /** The kinds the Owner has made autonomous for this business. */
  autonomous: readonly string[];
  /** The draft states a price. */
  hasPrice: boolean;
  /** Nothing has ever been sent to this lead. */
  firstToLead: boolean;
  /** The lead's contact is paused after a negative reply. */
  paused: boolean;
};

export type SendDecision =
  | { action: "hold"; reason: string }
  | { action: "approve"; reason: string }
  | { action: "send"; reason: string };

export const STOP_WORDS = {
  paused: "This lead replied negatively, so everything for them is paused until a person lifts the pause.",
  price: "It has a price, so a person approves it.",
  first: "It is the first message to this lead, so a person approves it.",
  kind: "This kind of message always waits for a person.",
  notAutonomous: "Waits for a person: this kind has not been made automatic.",
  autonomous: "Sent without asking: the Owner made this kind automatic.",
  wonLost: "Only the Owner marks a deal won or lost.",
  notLowStakes: "Only reminders, confirmations and sending something already promised can be made automatic.",
} as const;

/** What happens to one drafted message. Hard stops first, then the kind, then the Owner's choice. */
export function decideSend(context: SendContext): SendDecision {
  if (context.paused) return { action: "hold", reason: STOP_WORDS.paused };
  if (context.hasPrice) return { action: "approve", reason: STOP_WORDS.price };
  if (context.firstToLead || context.kind === "firstMessage") return { action: "approve", reason: STOP_WORDS.first };
  if (!canBeAutonomous(context.kind)) return { action: "approve", reason: STOP_WORDS.kind };
  if (!context.autonomous.includes(context.kind)) return { action: "approve", reason: STOP_WORDS.notAutonomous };
  return { action: "send", reason: STOP_WORDS.autonomous };
}
