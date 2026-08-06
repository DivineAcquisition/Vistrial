"use client";

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { btnGhost, btnSizeSm } from "@/lib/ui";

const VISIBLE_CHARACTERS = 6;

function mask(secret: string): string {
  return `${secret.slice(0, VISIBLE_CHARACTERS)}${"•".repeat(24)}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied.`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}.`);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label.toLowerCase()}`}
      className={`${btnGhost} ${btnSizeSm} px-2`}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-flag-good" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}

export function WebhookSecretField({ secret }: { secret: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <code className="rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-xs break-all text-silver">
        {revealed ? secret : mask(secret)}
      </code>
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        aria-label={revealed ? "Hide webhook secret" : "Reveal webhook secret"}
        className={`${btnGhost} ${btnSizeSm} px-2`}
      >
        {revealed ? (
          <EyeOffIcon className="size-3.5" />
        ) : (
          <EyeIcon className="size-3.5" />
        )}
      </button>
      <CopyButton value={secret} label="Webhook secret" />
    </div>
  );
}

export function CopyableValue({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <code className="rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-xs break-all text-silver">
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
