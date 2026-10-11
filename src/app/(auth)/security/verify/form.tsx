"use client";

import { useState, useTransition } from "react";

import { reenterPassword } from "@/app/(auth)/security/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { errorClass } from "@/lib/ui";

export function VerifyForm({ next, enrolled }: { next: string; enrolled: boolean }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      if (!enrolled) {
        const result = await reenterPassword(password, next);
        if (result && !result.ok) setError(result.error);
        return;
      }
      const supabase = createClient();
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.find((item) => item.status === "verified");
      if (listError || !factor) {
        setError("No authenticator app is set up on this account.");
        return;
      }
      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error || !challenge.data) {
        setError("Could not start the check.");
        return;
      }
      const checked = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: code.trim() });
      if (checked.error) {
        setError("That code did not match.");
        return;
      }
      window.location.assign(next);
    });

  return (
    <div className="space-y-3">
      {enrolled ? (
        <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" />
      ) : (
        <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
      )}
      <Button type="button" variant="primary" className="w-full" disabled={pending} onClick={confirm}>
        Continue
      </Button>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
