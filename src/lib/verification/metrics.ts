import {
  INJECTED_CATCH_ALERT_MIN_N,
  INJECTED_CATCH_ALERT_THRESHOLD,
  PASS_RATE_ALERT_MIN_N,
  PASS_RATE_ALERT_THRESHOLD,
} from "@/lib/verification/constants";

export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Pass rate among model-invoked runs only. */
export function shouldAlertPassRate(passed: number, flagged: number): boolean {
  const n = passed + flagged;
  if (n < PASS_RATE_ALERT_MIN_N) return false;
  return passed / n >= PASS_RATE_ALERT_THRESHOLD;
}

export function shouldAlertInjectedCatch(caught: number, total: number): boolean {
  if (total < INJECTED_CATCH_ALERT_MIN_N) return false;
  return caught / total < INJECTED_CATCH_ALERT_THRESHOLD;
}
