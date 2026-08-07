/** Password rules for team onboarding and account changes. */
export const MIN_PASSWORD_LENGTH = 12;

export type StrengthLevel = "weak" | "fair" | "good" | "strong";

export function passwordStrength(password: string): {
  level: StrengthLevel;
  score: number;
  hints: string[];
} {
  const hints: string[] = [];
  let score = 0;

  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  else hints.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);

  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else hints.push("Mix upper and lower case letters.");
  if (/\d/.test(password)) score += 1;
  else hints.push("Add a number.");
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else hints.push("Add a symbol.");

  const level: StrengthLevel =
    score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";

  return { level, score, hints };
}

export function isPasswordAcceptable(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
