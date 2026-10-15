"use client";

import { clearOutcomeQueue } from "@/lib/mobile/outcome-queue";

export const SIGN_OUT_PATH = "/auth/signout";

export function SignOutForm({
  children,
  className,
  ref,
}: {
  children?: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLFormElement>;
}) {
  return (
    <form
      ref={ref}
      method="post"
      action={SIGN_OUT_PATH}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        void clearOutcomeQueue().finally(() => form.submit());
      }}
    >
      {children}
    </form>
  );
}
