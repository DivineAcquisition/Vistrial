"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { issueRecoveryCodes } from "@/app/(auth)/security/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { errorClass, helperClass } from "@/lib/ui";

export function SetupWizard({ next, already }: { next: string; already: boolean }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () =>
    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const { data: listed } = await supabase.auth.mfa.listFactors();
      for (const factor of listed?.totp ?? []) {
        if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Vistrial" });
      if (enrollError || !data) {
        setError(enrollError?.message ?? "Could not start setup.");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    });

  const verify = () =>
    startTransition(async () => {
      if (!factorId) return;
      setError(null);
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        setError(challenge.error?.message ?? "Could not start the check.");
        return;
      }
      const checked = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
      if (checked.error) {
        setError("That code did not match. Try the next one.");
        return;
      }
      const issued = await issueRecoveryCodes();
      if (!issued.ok || !issued.codes) {
        setError(issued.ok ? "Codes were not created." : issued.error);
        return;
      }
      setCodes(issued.codes);
    });

  if (codes) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-white">Store these somewhere only you can open. Each one works once, in place of the app, for 15 minutes.</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-white">
          {codes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link href={next} className="inline-flex text-sm font-medium text-brand-300 underline">
          I have stored them
        </Link>
      </div>
    );
  }

  if (already && !factorId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-white">Your authenticator app is already set up.</p>
        <Button type="button" onClick={start}>
          Replace it and get new recovery codes
        </Button>
        <Link href={next} className="block text-sm text-brand-300 underline">
          Continue
        </Link>
      </div>
    );
  }

  if (!factorId) {
    return (
      <Button type="button" variant="primary" disabled={pending} onClick={start}>
        Show the setup code
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {qr ? (
        // The code is a data URL from the authenticator setup call, not a remote image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="Setup code for an authenticator app" className="h-40 w-40 rounded-lg bg-white p-2" />
      ) : null}
      {secret ? <p className={helperClass}>Or enter this secret: {secret}</p> : null}
      <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" />
      <Button type="button" variant="primary" disabled={pending || code.trim().length < 6} onClick={verify}>
        Verify and show recovery codes
      </Button>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
