import { createHash, randomBytes } from "node:crypto";

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

/** Eight single-use codes. The plaintext is shown once, then only the hash is kept. */
export function newRecoveryCodes(count = 8): Array<{ plain: string; hash: string }> {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex");
    const plain = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    return { plain, hash: hashRecoveryCode(plain) };
  });
}
