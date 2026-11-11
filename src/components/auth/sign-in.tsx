"use client";

import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthFrame } from "@/components/auth/auth-parts";
import { SignInView, type SignInBusy } from "@/components/auth/sign-in-view";
import { useConvexReady } from "@/components/providers/convex-ready";
import {
  chooseSecondMethod,
  resendSignInCode,
  startPasswordReset,
  startSignIn,
  submitNewPassword,
  submitPassword,
  switchToCode,
  switchToPassword,
  verifySignInCode,
  type SignInOutcome,
} from "@/lib/auth/actions";
import { explainAuthError, type AuthProblem } from "@/lib/auth/errors";
import { resumeSignInStep, type SecondMethod, type SignInStep } from "@/lib/auth/flow";
import { authHref, ssoCallbackPath } from "@/lib/auth/redirect";

/** Vistrial's own sign-in. Clerk holds the account; every screen here is ours. */
export function SignInScreen({ redirectTo, fromGoogle = false }: { redirectTo: string; fromGoogle?: boolean }) {
  const ready = useConvexReady();
  if (!ready) {
    return <AuthFrame title="Sign-in is not available here" detail="This address is not set up for accounts. Open the workspace from app.vistrial.io." />;
  }
  return <LiveSignIn redirectTo={redirectTo} fromGoogle={fromGoogle} />;
}

function LiveSignIn({ redirectTo, fromGoogle }: { redirectTo: string; fromGoogle: boolean }) {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { isLoaded, isSignedIn } = useAuth();
  const [step, setStep] = useState<SignInStep>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [busy, setBusy] = useState<SignInBusy>(null);
  const [sentCount, setSentCount] = useState(0);
  const leaving = useRef(false);
  const resumed = useRef(false);

  const leave = useCallback(
    (decorate: (url: string) => string = (url) => url) => {
      leaving.current = true;
      // A full page load, so the server sees the new session before it draws the workspace.
      window.location.assign(decorate(redirectTo));
    },
    [redirectTo],
  );

  /** Opens the session Clerk just created and moves on. */
  const finish = useCallback(async () => {
    leaving.current = true;
    const { error } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          leaving.current = false;
          setStep({ kind: "blocked", reason: "task" });
          return;
        }
        leave(decorateUrl);
      },
    });
    if (error) {
      leaving.current = false;
      setProblem(explainAuthError(error, { flow: "sign-in", field: "form" }));
    }
  }, [leave, signIn]);

  const apply = useCallback(
    (outcome: SignInOutcome, sent = true) => {
      setStep(outcome.step);
      setProblem(outcome.problem);
      if (sent && !outcome.problem) setSentCount((count) => count + 1);
      if (outcome.step.kind === "done") void finish();
    },
    [finish],
  );

  const run = useCallback(
    async (kind: Exclude<SignInBusy, null>, work: () => Promise<SignInOutcome>) => {
      setBusy(kind);
      setProblem(null);
      try {
        apply(await work());
      } catch (error) {
        setProblem(explainAuthError(error, { flow: "sign-in", field: "form" }));
      } finally {
        setBusy(null);
      }
    },
    [apply],
  );

  // Someone who is already signed in has no business on this page.
  useEffect(() => {
    if (isLoaded && isSignedIn && !leaving.current) leave();
  }, [isLoaded, isSignedIn, leave]);

  // Coming back from Google: pick up a second step that is waiting, or say why Google did not work.
  useEffect(() => {
    if (!clerk.loaded || resumed.current) return;
    resumed.current = true;
    const waiting = resumeSignInStep(signIn);
    const failed = fromGoogle ? signIn.firstFactorVerification?.error : null;
    queueMicrotask(() => {
      if (waiting.kind === "second") void run("switch", () => chooseSecondMethod(signIn, waiting.method));
      else if (waiting.kind === "new-password") setStep(waiting);
      else if (failed) setProblem(explainAuthError(failed, { flow: "sign-in", field: "form" }));
    });
  }, [clerk.loaded, fromGoogle, run, signIn]);

  const startOver = useCallback(() => {
    setStep({ kind: "email" });
    setProblem(null);
    void signIn.reset();
  }, [signIn]);

  return (
    <SignInView
      step={step}
      email={email}
      problem={problem}
      busy={busy}
      ready={clerk.loaded}
      sentCount={sentCount}
      signUpHref={authHref("/sign-up", redirectTo)}
      onEmail={(value) => {
        setEmail(value);
        void run("submit", () => startSignIn(signIn, value));
      }}
      onGoogle={async () => {
        setBusy("google");
        setProblem(null);
        const callback = ssoCallbackPath(redirectTo, "sign-in");
        const { error } = await signIn.sso({ strategy: "oauth_google", redirectUrl: callback, redirectCallbackUrl: callback });
        // On success the browser is already on its way to Google, so the button keeps spinning.
        if (error) {
          setProblem(explainAuthError(error, { flow: "sign-in", field: "form" }));
          setBusy(null);
        }
      }}
      onPassword={(password) => void run("submit", () => submitPassword(signIn, step, password))}
      onCode={(code) => void run("submit", () => verifySignInCode(signIn, step, code))}
      onResend={async () => {
        setBusy("resend");
        const failed = await resendSignInCode(signIn, step);
        setProblem(failed);
        if (!failed) setSentCount((count) => count + 1);
        setBusy(null);
      }}
      onUseCode={() => void run("switch", () => switchToCode(signIn))}
      onUsePassword={() => apply(switchToPassword(signIn), false)}
      onForgot={() => void run("switch", () => startPasswordReset(signIn, step))}
      onNewPassword={(password) => void run("submit", () => submitNewPassword(signIn, password))}
      onSecondMethod={(method: SecondMethod) => void run("switch", () => chooseSecondMethod(signIn, method))}
      onStartOver={startOver}
    />
  );
}
