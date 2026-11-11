"use client";

import { HandleSSOCallback, useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthFrame, Working, authLinkClass } from "@/components/auth/auth-parts";
import { useConvexReady } from "@/components/providers/convex-ready";
import { BLOCKED_WORDS } from "@/lib/auth/flow";
import { authHref } from "@/lib/auth/redirect";

/** How long the page waits on Clerk before offering the way back, so nobody is left on a spinner. */
const GIVE_UP_AFTER_MS = 12_000;

/**
 * Where Google sends the browser back to. Clerk finishes the sign-in here; this page then moves on
 * to the workspace, or back to our own sign-in or sign-up page when there is something left to do.
 */
export function SsoCallback({ redirectTo, from }: { redirectTo: string; from: "sign-in" | "sign-up" }) {
  const ready = useConvexReady();
  if (!ready) return <AuthFrame title="Sign-in is not available here" />;
  return <LiveCallback redirectTo={redirectTo} from={from} />;
}

function LiveCallback({ redirectTo, from }: { redirectTo: string; from: "sign-in" | "sign-up" }) {
  const clerk = useClerk();
  const router = useRouter();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { isLoaded, isSignedIn } = useAuth();
  const [stuck, setStuck] = useState<null | "slow" | "task">(null);
  const moved = useRef(false);

  const back = useCallback(
    (page: "/sign-in" | "/sign-up") => {
      if (moved.current) return;
      moved.current = true;
      router.replace(`${authHref(page, redirectTo)}&google=1`);
    },
    [redirectTo, router],
  );

  // When Google needed nothing more, Clerk has already opened the session by the time this page
  // loads, and its handler has nothing left to do. Move on.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || moved.current) return;
    moved.current = true;
    window.location.assign(redirectTo);
  }, [isLoaded, isSignedIn, redirectTo]);

  // Clerk's handler covers a finished sign-in, a new account and a waiting second step. It does
  // nothing when Google was cancelled or the device still has to be confirmed, so those are sent
  // back to our own pages here, which then say what happened.
  useEffect(() => {
    if (!clerk.loaded) return;
    const signInFailed = Boolean(signIn.firstFactorVerification?.error) && !signIn.isTransferable;
    const signUpFailed = Boolean(signUp.verifications?.externalAccount?.error) && !signUp.isTransferable;
    if (signIn.status === "needs_client_trust") back("/sign-in");
    else if (from === "sign-up" && signUpFailed) back("/sign-up");
    else if (signInFailed) back("/sign-in");
    else if (signUpFailed) back("/sign-up");
  }, [back, clerk.loaded, from, signIn, signUp]);

  useEffect(() => {
    const timer = window.setTimeout(() => setStuck((now) => now ?? "slow"), GIVE_UP_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const retryHref = authHref(from === "sign-up" ? "/sign-up" : "/sign-in", redirectTo);

  return (
    <AuthFrame
      title={stuck === "task" ? "One more step is needed" : stuck === "slow" ? "This is taking too long" : "Finishing sign-in"}
      detail={stuck === "slow" ? "Google sign-in did not finish. Nothing was changed." : undefined}
    >
      {stuck === "task" ? <p className="text-sm leading-6 text-foreground">{BLOCKED_WORDS.task}</p> : null}
      {stuck === null ? <Working label="One moment." /> : null}
      {stuck ? (
        <p className="text-center text-sm">
          <a className={authLinkClass} href={retryHref}>
            Back to {from === "sign-up" ? "create your account" : "sign in"}
          </a>
        </p>
      ) : null}
      <HandleSSOCallback
        navigateToApp={({ session, decorateUrl }) => {
          if (session?.currentTask) return setStuck("task");
          if (moved.current) return;
          moved.current = true;
          // A full page load, so the server sees the new session before it draws the workspace.
          window.location.assign(decorateUrl(redirectTo));
        }}
        navigateToSignIn={() => back("/sign-in")}
        navigateToSignUp={() => back("/sign-up")}
      />
    </AuthFrame>
  );
}
