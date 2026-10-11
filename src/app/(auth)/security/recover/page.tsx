"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { redeemRecoveryCode } from "@/app/(auth)/security/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeInternalPath } from "@/lib/auth/paths";
import { errorClass, helperClass } from "@/lib/ui";

function RecoverForm() {
  const params = useSearchParams();
  const next = safeInternalPath(params.get("next"), "/app/team");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="xxxxx-xxxxx" autoComplete="off" />
      <Button
        type="button"
        variant="primary"
        className="w-full"
        disabled={pending || code.trim().length < 8}
        onClick={() =>
          startTransition(async () => {
            const result = await redeemRecoveryCode(code, next);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Use this code
      </Button>
      <p className={helperClass}>It works once, for 15 minutes, in place of the authenticator app. Then set the app up again if you have lost it.</p>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

export default function RecoverPage() {
  return (
    <AuthCard title="Recovery code" subtitle="Use one of the codes you stored when you set up the authenticator app." eyebrowLabel="Vistrial team">
      <Suspense>
        <RecoverForm />
      </Suspense>
    </AuthCard>
  );
}
