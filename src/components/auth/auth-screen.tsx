"use client";

import { SignIn, SignUp } from "@clerk/nextjs";

import { authAppearance } from "@/components/auth/appearance";
import Logo from "@/components/brand/logo";

export function AuthScreen({
  mode,
  redirectTo,
}: {
  mode: "sign-in" | "sign-up";
  redirectTo: string;
}) {
  const signIn = mode === "sign-in";
  const title = signIn ? "Open your workspace" : "Create your account";
  const detail = signIn
    ? "Email or Google. You name the workspace after you sign in."
    : "Email or Google. Then you name the workspace.";
  const redirectQuery = `redirect_url=${encodeURIComponent(redirectTo)}`;

  return (
    <section className="mx-auto w-full max-w-[26rem]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--panel-shadow)]">
        <div className="border-b border-border bg-gradient-to-b from-brand-950 to-card px-6 pt-8 pb-6 text-center">
          <Logo markOnly className="mx-auto size-12" title="" />
          <p className="mt-4 text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">Workspace</p>
          <h1 className="mt-2 font-heading text-2xl text-strong">{title}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
        {signIn ? (
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl={`/sign-up?${redirectQuery}`}
            fallbackRedirectUrl={redirectTo}
            forceRedirectUrl={redirectTo}
            appearance={authAppearance}
          />
        ) : (
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl={`/sign-in?${redirectQuery}`}
            fallbackRedirectUrl={redirectTo}
            forceRedirectUrl={redirectTo}
            appearance={authAppearance}
          />
        )}
      </div>
    </section>
  );
}
