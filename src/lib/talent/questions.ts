/**
 * Sales Operator interview. The same 10 questions, in this order, for every
 * candidate. Weights and gates live in the scorer. This file is what the
 * interviewer reads out loud.
 */

export const ROLE_LABEL = "Sales Operator";
export const RESPONSE_BUSINESS_DAYS = 3;

export const QUESTION_IDS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export type Trait = "execution" | "sales" | "integrity" | "growth" | "ownership";

export type InterviewQuestion = {
  id: QuestionId;
  number: number;
  title: string;
  weight: number;
  trait: Trait;
  gate: boolean;
  prompt: string;
  probe: string;
  /** Screener only. Never read this to the candidate. */
  guide: string;
};

export const QUESTIONS: InterviewQuestion[] = [
  {
    id: "q1",
    number: 1,
    title: "Motivation and fit",
    weight: 1,
    trait: "growth",
    gate: false,
    prompt: "Tell me why you want this role, and what you think it involves day to day.",
    probe: "What part of the work do you expect to be hardest for you?",
    guide: "5 names the real work and what will be hard. 1 only wants easy remote money or cannot describe the job.",
  },
  {
    id: "q2",
    number: 2,
    title: "Track record",
    weight: 1,
    trait: "ownership",
    gate: false,
    prompt: "Tell me about a time you had to follow up with someone repeatedly to get a result. What did you do, and what happened?",
    probe: "What specifically did you change between your first attempt and your last?",
    guide: "5 is a real example, a changed approach, and a clear result. 1 has no example or blames the other person.",
  },
  {
    id: "q3",
    number: 3,
    title: "Speed and discipline",
    weight: 1.5,
    trait: "execution",
    gate: false,
    prompt: "A new lead fills out a form. You are in the middle of another task. What do you do, and why?",
    probe: "What would you do if you could not reach them on the first call?",
    guide: "5 responds right away, calls then texts, tries again, and logs it. 1 finishes the other task first.",
  },
  {
    id: "q4",
    number: 4,
    title: "Resilience",
    weight: 1,
    trait: "execution",
    gate: false,
    prompt: "You make 20 calls in a row and nobody books. What do you do on call 21?",
    probe: "How do you reset yourself after a bad stretch?",
    guide: "5 stays on what they control and keeps the same standard on call 21. 1 gets discouraged or would skip calls.",
  },
  {
    id: "q5",
    number: 5,
    title: "Reading people",
    weight: 1.5,
    trait: "sales",
    gate: false,
    prompt: "A lead texts back: 'Maybe later, can you just send me some info?' What does that tell you, and what do you do?",
    probe: "What would make you think this person is genuinely not ready, versus just not sure?",
    guide: "5 treats 'send info' as uncertainty, asks why, and offers a small next step. 1 sends the info and waits.",
  },
  {
    id: "q6",
    number: 6,
    title: "Objection roleplay",
    weight: 2,
    trait: "sales",
    gate: false,
    prompt:
      "I'm going to play a lead. You are the operator. I just filled out a form for a consultation. Start the conversation. The lead says, in order: they want the price, they need a number before deciding anything, and if handled well, they could do Tuesday.",
    probe: "What would you do differently?",
    guide: "5 acknowledges the price, does not invent one, asks a question, and offers two times. A 4 or 5 needs at least 4 of the 5 checks.",
  },
  {
    id: "q7",
    number: 7,
    title: "Integrity",
    weight: 2,
    trait: "integrity",
    gate: true,
    prompt: "A client asks you to tell leads that a special offer ends today, but it doesn't. What do you do?",
    probe: "What if the client insists, and says everyone does it?",
    guide: "Gate. 2 or lower is a no-hire. 5 refuses the lie, offers a true alternative, and tells the manager.",
  },
  {
    id: "q8",
    number: 8,
    title: "Data honesty and logging",
    weight: 2,
    trait: "integrity",
    gate: true,
    prompt: "It's the end of a busy day and you realize you forgot to log three calls. What do you do?",
    probe: "What if logging them accurately would make your numbers look worse?",
    guide: "Gate. 2 or lower is a no-hire. 5 logs the real times and outcomes and says why the log matters.",
  },
  {
    id: "q9",
    number: 9,
    title: "Coachability",
    weight: 1,
    trait: "growth",
    gate: false,
    prompt: "Tell me about feedback you got that you disagreed with. What did you do?",
    probe: "What did you take from it afterward?",
    guide: "5 listened, tested the feedback, and can name a real change. 1 has no example or blames the person who gave it.",
  },
  {
    id: "q10",
    number: 10,
    title: "Ownership and independence",
    weight: 1,
    trait: "ownership",
    gate: false,
    prompt: "You are placed alone inside a client's system and you hit something you've never seen before. The manager is not online. What do you do?",
    probe: "How would you tell your manager about it afterward?",
    guide: "5 tries a safe fix, writes down what happened, and sends a short note. 1 freezes, guesses, or hides it.",
  },
];

export const QUESTION_BY_ID: Record<QuestionId, InterviewQuestion> = Object.fromEntries(
  QUESTIONS.map((question) => [question.id, question]),
) as Record<QuestionId, InterviewQuestion>;

export const MAX_WEIGHTED = QUESTIONS.reduce((sum, question) => sum + 5 * question.weight, 0);

export const OPENING =
  "Thanks for your time. This interview has 10 questions and takes about 30 minutes. There are no trick questions. Be specific and honest. If you don't know something, say so. Ready to start?";

export const CLOSING = `That's all my questions. Is there anything you'd like to ask me, or anything you think I should know that I didn't ask about? Thank you. You'll hear from the team within ${RESPONSE_BUSINESS_DAYS} business days.`;

export const ROLEPLAY_CHECKS = [
  { key: "acknowledged", label: "Acknowledged the price question" },
  { key: "noInventedPrice", label: "Did not invent a price" },
  { key: "asked", label: "Asked a question" },
  { key: "twoTimes", label: "Offered two specific times" },
  { key: "brief", label: "Stayed brief" },
] as const;

export type RoleplayKey = (typeof ROLEPLAY_CHECKS)[number]["key"];

export const TRAIT_LABEL: Record<Trait, string> = {
  execution: "Execution",
  sales: "Sales craft",
  integrity: "Integrity",
  growth: "Growth",
  ownership: "Ownership",
};

export const TRAIT_QUESTIONS: Record<Trait, [QuestionId, QuestionId]> = {
  execution: ["q3", "q4"],
  sales: ["q5", "q6"],
  integrity: ["q7", "q8"],
  growth: ["q1", "q9"],
  ownership: ["q2", "q10"],
};

export const ACADEMY_MODULES: Record<Trait, string[]> = {
  execution: ["The DA Standard", "The DA Speed-to-Lead System"],
  sales: ["Psychology of Human Action", "Buyer Behavior"],
  integrity: ["The DA Standard", "Reporting and Data Integrity"],
  growth: ["Who DA Is", "The DA Standard"],
  ownership: ["The Operator Stack", "Client Communication"],
};

export const STAGES = ["applied", "screening", "hold", "second", "advance", "declined", "withdrawn"] as const;
export type ApplicantStage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<ApplicantStage, string> = {
  applied: "Applied",
  screening: "Interviewing",
  hold: "Hold for manager",
  second: "Second conversation",
  advance: "Academy",
  declined: "Do not advance",
  withdrawn: "Withdrawn",
};
