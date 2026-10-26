"use client";

import { SignIn } from "@clerk/nextjs";

import { authAppearance } from "@/components/auth/appearance";
import Logo from "@/components/brand/logo";

const staffAppearance = {
  ...authAppearance,
  elements: {
    ...authAppearance.elements,
    footerAction: "hidden!",
  },
};

export function SignInCard({
  eyebrow,
  title,
  detail,
  fallbackRedirectUrl,
  allowSignUp = true,
}: {
  eyebrow?: string;
  title: string;
  detail: string;
  fallbackRedirectUrl: string;
  allowSignUp?: boolean;
}) {
  return (
    <section className="mx-auto w-full max-w-[26rem]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--panel-shadow)]">
        <div className="border-b border-border bg-gradient-to-b from-brand-950 to-card px-6 pt-8 pb-6 text-center">
          <Logo markOnly className="mx-auto size-12" title="" />
          {eyebrow ? (
            <p className="mt-4 text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="mt-2 font-heading text-2xl text-strong">{title}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
        <SignIn
          routing="hash"
          appearance={allowSignUp ? authAppearance : staffAppearance}
          fallbackRedirectUrl={fallbackRedirectUrl}
          withSignUp={allowSignUp}
        />
      </div>
    </section>
  );
}
