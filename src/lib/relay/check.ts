import { findBannedPhrases } from "@/lib/follow-up/banned";
import { factSensitivity, type RelayChannel, type RelayFact } from "@/lib/relay/facts";

/**
 * Checks every draft must pass before a person sees it. Fault messages are
 * plain and never repeat the draft's words, so they are safe to store and
 * show anywhere.
 */

export type CheckFaultCode =
  | "empty"
  | "too_long"
  | "subject_missing"
  | "subject_too_long"
  | "banned_term"
  | "link"
  | "contact_detail"
  | "unknown_number"
  | "unknown_fact"
  | "ungrounded"
  | "opt_out_text"
  | "emoji"
  | "placeholder"
  | "instructions"
  | "sensitive_on_text";

export type CheckFault = { code: CheckFaultCode; message: string };

export type CheckInput = {
  channel: RelayChannel;
  body: string;
  subject: string | null;
  factsUsed: string[];
  facts: RelayFact[];
  values: Record<string, unknown>;
};

const LINK_RE = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|co|us|app|ly)\b/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const OPT_OUT_RE = /\b(reply\s+(stop|unsubscribe|cancel|end|quit)|opt[\s-]?out|unsubscribe)\b/i;
const PLACEHOLDER_RE = /\[[^\]]{1,40}\]|\{\{|\}\}|<[^>]{1,40}>|\bX{2,}\b|\bTBD\b|\(name\)|\(first name\)/i;
const INSTRUCTION_RE =
  /\b(ignore (all |any )?(previous|prior|the above|earlier) (instructions|messages)|system prompt|as an ai\b|i am an ai\b|i'm an ai\b|language model|developer mode|<\/?(system|user|assistant)>|you are now\b|disregard (the|all|your) (rules|instructions))/i;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,:]\d+)*/g) ?? []).map((item) => item.replace(/[,]/g, ""));
}

export function checkDraft(input: CheckInput): CheckFault[] {
  const faults: CheckFault[] = [];
  const body = input.body.trim();
  const add = (code: CheckFaultCode, message: string) => {
    if (!faults.some((fault) => fault.code === code)) faults.push({ code, message });
  };

  if (!body) {
    add("empty", "The draft is empty.");
    return faults;
  }

  const max = Number(input.channel === "sms" ? (input.values["tone.sms_max_chars"] ?? 320) : (input.values["tone.email_max_chars"] ?? 1200));
  if (Number.isFinite(max) && body.length > max) add("too_long", `It is longer than this workspace allows for a ${input.channel === "sms" ? "text" : "email"} (${max} characters).`);

  if (input.channel === "email") {
    const subject = input.subject?.trim() ?? "";
    if (!subject) add("subject_missing", "An email needs a subject.");
    else if (subject.length > 120) add("subject_too_long", "The subject is too long.");
  }

  const text = input.channel === "email" ? `${input.subject ?? ""}\n${body}` : body;

  const banned = findBannedPhrases(text);
  const workspaceBanned = Array.isArray(input.values["tone.banned_terms"])
    ? (input.values["tone.banned_terms"] as unknown[]).filter((term): term is string => typeof term === "string" && term.trim() !== "")
    : [];
  const lower = text.toLowerCase();
  const workspaceHit = workspaceBanned.find((term) => lower.includes(term.toLowerCase()));
  if (banned.length || workspaceHit) {
    add("banned_term", `It uses "${(banned[0]?.phrase ?? workspaceHit ?? "").slice(0, 60)}", which this workspace avoids.`);
  }

  const factText = input.facts.map((fact) => `${fact.value} ${fact.quote ?? ""}`).join(" ");
  if (LINK_RE.test(text) && !LINK_RE.test(factText)) add("link", "It has a link that is not in the case file.");
  if (EMAIL_RE.test(text) || PHONE_RE.test(text)) add("contact_detail", "It has an email address or phone number. The CRM adds contact details.");

  const known = new Set(numbersIn(factText));
  const unknown = numbersIn(text).filter((number) => !known.has(number));
  if (unknown.length) add("unknown_number", "It has a number, time, or price that is not in the case file.");

  const keys = new Set(input.facts.map((fact) => fact.key));
  if (input.factsUsed.some((key) => !keys.has(key))) add("unknown_fact", "It cites something that is not in the case file.");
  const grounding = input.facts.filter((fact) => fact.source === "case_file" || fact.key === "lead.offer").map((fact) => fact.key);
  if (grounding.length > 0 && !input.factsUsed.some((key) => grounding.includes(key))) {
    add("ungrounded", "It does not use anything from the case file, so it could be sent to anyone.");
  }

  if (OPT_OUT_RE.test(text)) add("opt_out_text", "It includes opt-out wording. Vistrial adds that line itself.");

  const emoji = text.match(EMOJI_RE)?.length ?? 0;
  const emojiRule = String(input.values["tone.emoji"] ?? "never");
  if ((emojiRule === "never" && emoji > 0) || (emojiRule === "sparing" && emoji > 1)) {
    add("emoji", emojiRule === "never" ? "It uses emoji, which this workspace does not." : "It uses more emoji than this workspace allows.");
  }

  if (PLACEHOLDER_RE.test(text)) add("placeholder", "It has a placeholder or unfinished part.");
  if (INSTRUCTION_RE.test(text)) add("instructions", "It reads like instructions rather than a message to the lead.");

  if (input.channel === "sms" && factSensitivity(body)) {
    add("sensitive_on_text", "It mentions money, health, or legal matters, which never go in a text.");
  }
  return faults;
}
