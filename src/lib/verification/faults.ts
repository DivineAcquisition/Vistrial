import { extractJsonObject } from "@/lib/extraction/parse";
import type { VerificationFault } from "@/lib/verification/types";

export function fault(code: string, where: string, what: string): VerificationFault {
  return { code, where, what };
}

export function asFaults(value: unknown): VerificationFault[] {
  if (!Array.isArray(value)) return [];
  const out: VerificationFault[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const code = typeof rec.code === "string" ? rec.code.trim() : "";
    const where = typeof rec.where === "string" ? rec.where.trim() : "";
    const what = typeof rec.what === "string" ? rec.what.trim() : "";
    if (!code || !what) continue;
    out.push(fault(code, where || "output", what));
  }
  return uniqueFaults(out);
}

export function uniqueFaults(faults: VerificationFault[]): VerificationFault[] {
  const seen = new Set<string>();
  const out: VerificationFault[] = [];
  for (const item of faults) {
    const key = `${item.code}:${item.where}:${item.what}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function formatFaultsForRetry(faults: VerificationFault[]): string {
  return faults.map((item) => `${item.code} at ${item.where}: ${item.what}`).join("\n");
}

/**
 * Parse the verifier's JSON. The verifier is asked for faults, not approval.
 * Unknown shapes become a single parse fault so we never treat garbage as a pass.
 */
export function parseVerifierResponse(raw: string): {
  faults: VerificationFault[];
  wouldEmbarrass: boolean | null;
} {
  try {
    const parsed = extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        faults: [fault("verifier_parse", "response", "Verifier returned no JSON object.")],
        wouldEmbarrass: null,
      };
    }
    const row = parsed as Record<string, unknown>;
    const faults: VerificationFault[] = [];
    if (Array.isArray(row.faults)) {
      for (const item of row.faults) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const rec = item as Record<string, unknown>;
        const code = typeof rec.code === "string" ? rec.code.trim() : "";
        const where = typeof rec.where === "string" ? rec.where.trim() : "";
        const what = typeof rec.what === "string" ? rec.what.trim() : "";
        if (!code || !what) continue;
        faults.push(fault(code, where || "output", what));
      }
    }
    const embarrass =
      row.would_embarrass === true || row.wouldEmbarrass === true
        ? true
        : row.would_embarrass === false || row.wouldEmbarrass === false
          ? false
          : null;
    if (embarrass === true) {
      faults.push(
        fault(
          "would_embarrass",
          "draft",
          typeof row.embarrass_reason === "string" && row.embarrass_reason.trim()
            ? row.embarrass_reason.trim()
            : "Sending this to a real prospect would embarrass the business."
        )
      );
    }
    return { faults: uniqueFaults(faults), wouldEmbarrass: embarrass };
  } catch {
    return {
      faults: [fault("verifier_parse", "response", "Verifier returned invalid JSON.")],
      wouldEmbarrass: null,
    };
  }
}
