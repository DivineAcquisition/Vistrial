/**
 * How a new reading meets the case file already there. A field a person
 * edited or locked is never overwritten: Scribe's new value is kept beside it
 * with a note for the person to review. The database enforces the same rule.
 */

export type FactState = "present" | "unclear" | "absent";

export type ExtractedFact = {
  key: string;
  label: string;
  state: FactState;
  value: string | number | boolean | null;
  quote: string | null;
  passageIds: string[];
};

export type ExistingField = {
  field_key: string;
  value: unknown;
  state: FactState;
  source: "scribe" | "person";
  locked: boolean;
};

export type FieldWrite =
  | { kind: "scribe"; fact: ExtractedFact }
  | { kind: "review"; fact: ExtractedFact; note: string }
  | { kind: "keep"; key: string };

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function planFieldWrites(existing: ExistingField[], facts: ExtractedFact[]): FieldWrite[] {
  const byKey = new Map(existing.map((f) => [f.field_key, f]));
  return facts.map((fact): FieldWrite => {
    const current = byKey.get(fact.key);
    if (!current || (current.source === "scribe" && !current.locked)) {
      // A newer call that says nothing about a fact does not erase what an earlier call established.
      if (current && fact.state === "absent" && current.state !== "absent") return { kind: "keep", key: fact.key };
      return { kind: "scribe", fact };
    }
    if (fact.state === "absent" || same(current.value, fact.value)) return { kind: "keep", key: fact.key };
    const who = current.locked ? "locked" : "edited by a person";
    return {
      kind: "review",
      fact,
      note: `This field is ${who}. The latest call suggests a different value; it was not changed.`,
    };
  });
}
