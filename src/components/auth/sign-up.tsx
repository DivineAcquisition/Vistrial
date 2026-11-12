"use client";

import { useAuth, useClerk, useSignUp } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthFrame } from "@/components/auth/auth-parts";
import { SignUpView, type SignUpBusy } from "@/components/auth/sign-up-view";
import { useConvexReady } from "@/components/providers/convex-ready";
import { resendSignUpCode, startSignUp, submitSignUpDetails, verifySignUpCode, type SignUpOutcome } from "@/lib/auth/actions";
import { explainAuthError, type AuthProblem } from "@/lib/auth/errors";
import { signUpStep, type SignUpStep } from "@/lib/auth/flow";
import { authHref, ssoCallbackPath } from "@/lib/auth/redirect";

/** Vistrial's own sign-up. Clerk holds the account; every screen here is ours. */
export function SignUpScreen({ redirectTo, fromGoogle = false }: { redirectTo: string; fromGoogle?: boolean }) {
  const ready = useConvexReady();
  if (!ready) {
    return <AuthFrame title="Sign-up is not available here" detail="This address is not set up for accounts. Create your account from app.vistrial.io." />;
  }
  return <LiveSignUp redirectTo={redirectTo} fromGoogle={fromGoogle} />;
}

function LiveSignUp({ redirectTo, fromGoogle }: { redirectTo: string; fromGoogle: boolean }) {
  const clerk = useClerk();
  const { signUp } = useSignUp();
  const { isLoaded, isSignedIn } = useAuth();
  const [step, setStep] = useState<SignUpStep>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [busy, setBusy] = useState<SignUpBusy>(null);
  const [sentCount, setSentCount] = useState(0);
  const leaving = useRef(false);
  const resumed = useRef(false);

  const leave = useCallback(
    (decorate: (url: string) => string = (url) => url) => {
      leaving.current = true;
      // A full page load, so the server sees the new session before it draws onboarding.
      window.location.assign(decorate(redirectTo));
    },
    [redirectTo],
  );

  const finish = useCallback(async () => {
    leaving.current = true;
    const { error } = await signUp.finalize({ navigate: ({ decorateUrl }) => leave(decorateUrl) });
    if (error) {
      leaving.current = false;
      setProblem(explainAuthError(error, { flow: "sign-up", field: "form" }));
    }
  }, [leave, signUp]);

  const apply = useCallback(
    (outcome: SignUpOutcome) => {
      setStep(outcome.step);
      setProblem(outcome.problem);
      if (outcome.step.kind === "verify" && !outcome.problem) setSentCount((count) => count + 1);
      if (outcome.step.kind === "done") void finish();
    },
    [finish],
  );

  const run = useCallback(
    async (work: () => Promise<SignUpOutcome>) => {
      setBusy("submit");
      setProblem(null);
      try {
        apply(await work());
      } catch (error) {
        setProblem(explainAuthError(error, { flow: "sign-up", field: "form" }));
      } finally {
        setBusy(null);
      }
    },
    [apply],
  );

  useEffect(() => {
    if (isLoaded && isSignedIn && !leaving.current) leave();
  }, [isLoaded, isSignedIn, leave]);

  // Coming back from Google with an account that still needs an answer or two: ask only for those.
  useEffect(() => {
    if (!clerk.loaded || resumed.current || !fromGoogle) return;
    resumed.current = true;
    const failed = signUp.verifications?.externalAccount?.error;
    const waiting = signUpStep(signUp);
    queueMicrotask(() => {
      if (failed) setProblem(explainAuthError(failed, { flow: "sign-up", field: "form" }));
      else if (waiting.kind === "details" || waiting.kind === "blocked") setStep(waiting);
    });
  }, [clerk.loaded, fromGoogle, signUp]);

  return (
    <SignUpView
      step={step}
      email={email}
      problem={problem}
      busy={busy}
      ready={clerk.loaded}
      sentCount={sentCount}
      signInHref={authHref("/sign-in", redirectTo)}
      onEmail={(value) => {
        setEmail(value);
        void run(() => startSignUp(signUp, value));
      }}
      onGoogle={async () => {
        setBusy("google");
        setProblem(null);
        const callback = ssoCallbackPath(redirectTo, "sign-up");
        const { error } = await signUp.sso({ strategy: "oauth_google", redirectUrl: callback, redirectCallbackUrl: callback });
        // On success the browser is already on its way to Google, so the button keeps spinning.
        if (error) {
          setProblem(explainAuthError(error, { flow: "sign-up", field: "form" }));
          setBusy(null);
        }
      }}
      onDetails={(details) => {
        if (step.kind !== "details") return;
        void run(() => submitSignUpDetails(signUp, email || null, step, details));
      }}
      onCode={(code) => void run(() => verifySignUpCode(signUp, code))}
      onResend={async () => {
        setBusy("resend");
        const failed = await resendSignUpCode(signUp);
        setProblem(failed);
        if (!failed) setSentCount((count) => count + 1);
        setBusy(null);
      }}
      onStartOver={() => {
        setStep({ kind: "email" });
        setProblem(null);
        void signUp.reset();
      }}
    />
  );
}
