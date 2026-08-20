/**
 * Hit `?forceError=1` on a data route to verify the error boundary.
 * Not linked in the UI — operators should not land here in normal use.
 */
export function throwIfForcedRouteError(value: string | string[] | undefined) {
  const flag = Array.isArray(value) ? value[0] : value;
  if (flag === "1") {
    throw new Error("Forced route failure for error-boundary verification");
  }
}
