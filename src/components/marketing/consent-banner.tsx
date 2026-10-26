"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  CONSENT_DISMISS_DAYS,
  CONSENT_LIFETIME_DAYS,
  categoryAllowed,
  choiceFromMode,
  consentIsCurrent,
  globalPrivacyControlOn,
  readConsentCookie,
  rememberSnapshot,
  writeConsentCookie,
  type ConsentMode,
  type StoredConsent,
} from "@/lib/marketing/consent";
import type { TrackingTool } from "@/lib/marketing/tracking-types";
import { cn } from "@/lib/utils";

type Snap = { ready: boolean; choice: StoredConsent | null; gpc: boolean; saved: boolean };

const SERVER: Snap = { ready: false, choice: null, gpc: false, saved: true };
const snapSlot: { key: string; value?: Snap } = { key: "" };

function subscribeConsent(onChange: () => void) {
  const refresh = () => onChange();
  window.addEventListener("vistrial-consent", refresh);
  window.addEventListener("vistrial-open-consent", refresh);
  return () => {
    window.removeEventListener("vistrial-consent", refresh);
    window.removeEventListener("vistrial-open-consent", refresh);
  };
}

function consentSnapKey(version: number, choice: StoredConsent | null, gpc: boolean, saved: boolean) {
  const fields = choice ? `${choice.v}.${choice.a}.${choice.d}.${choice.m}.${choice.t}.${choice.o}` : "";
  return `${version}|${gpc ? 1 : 0}|${saved ? 1 : 0}|${fields}`;
}

function readClientSnap(version: number): Snap {
  const choice = readConsentCookie();
  const gpc = globalPrivacyControlOn();
  const saved = consentIsCurrent(choice, version);
  return rememberSnapshot(snapSlot, consentSnapKey(version, choice, gpc, saved), () => ({
    ready: true,
    choice,
    gpc,
    saved,
  }));
}

function useConsent(version: number) {
  const getSnapshot = useCallback(() => readClientSnap(version), [version]);
  return useSyncExternalStore(subscribeConsent, getSnapshot, () => SERVER);
}

function save(mode: ConsentMode, version: number, gpc: boolean, custom?: { analytics: boolean; advertising: boolean }) {
  const choice = choiceFromMode(mode, version, gpc);
  if (mode === "custom" && custom) {
    choice.a = custom.analytics ? 1 : 0;
    choice.d = custom.advertising ? 1 : 0;
    choice.o = gpc ? 1 : 0;
  }
  const days = mode === "dismiss" ? CONSENT_DISMISS_DAYS : CONSENT_LIFETIME_DAYS;
  const ok = writeConsentCookie(choice, days * 24 * 60 * 60);
  if (ok) {
    void fetch("/api/marketing/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    }).catch(() => undefined);
    window.location.reload();
  }
  return ok;
}

export function ConsentBanner({
  version,
  tools,
}: {
  version: number;
  tools: TrackingTool[];
}) {
  const snap = useConsent(version);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const gpc = snap.gpc;
  const showBanner = snap.ready && !snap.saved && !open;

  function openPreferences() {
    const choice = readConsentCookie();
    const allowed = (category: "analytics" | "advertising") =>
      categoryAllowed({ choice, category, gpc, version });
    setAnalytics(allowed("analytics"));
    setAdvertising(allowed("advertising"));
    setOpen(true);
    setBlocked(false);
  }

  const openPreferencesRef = useRef(openPreferences);
  useEffect(() => {
    openPreferencesRef.current = openPreferences;
  });
  useEffect(() => {
    const listener = () => openPreferencesRef.current();
    window.addEventListener("vistrial-open-consent", listener);
    return () => window.removeEventListener("vistrial-open-consent", listener);
  }, []);

  return (
    <>
      {showBanner ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 py-3 backdrop-blur" role="dialog" aria-label="Cookie choices">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              We use cookies and similar tools to keep this site working, and, if you allow it, to understand how it is used and to measure our ads. Nothing optional runs until you choose.{" "}
              <a href="/privacy" className="text-brand-300 underline">Privacy</a>
              {" · "}
              <a href="/cookies" className="text-brand-300 underline">Cookies</a>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={() => save("accept", version, gpc)}>Accept all</Button>
              <Button type="button" variant="outline" onClick={() => save("reject", version, gpc)}>Reject all</Button>
              <Button type="button" variant="outline" onClick={openPreferences}>Manage preferences</Button>
            </div>
            <button type="button" className="text-left text-xs text-muted-foreground underline" onClick={() => { if (!save("dismiss", version, gpc)) setBlocked(true); }}>
              Close without choosing
            </button>
            {blocked ? <p className="text-xs text-muted-foreground">We could not save a choice in this browser. Optional tools stay off.</p> : null}
          </div>
        </div>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Cookie preferences">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-5">
            <h2 className="font-heading text-xl text-strong">Cookie preferences</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your choice applies to this browser.</p>
            {gpc ? <p className="mt-2 text-sm text-strong">We detected your Global Privacy Control setting and are honoring it. You can still allow a category here.</p> : null}
            <Category title="Essential" body="Always on. Sign-in, security, form abuse checks, and remembering this choice." locked />
            <Category title="Analytics" body="Page counts on our servers, and Google Analytics when it is switched on." checked={analytics} onChange={setAnalytics} />
            <Category title="Advertising" body="The Meta pixel, when it is switched on, to measure our own ads." checked={advertising} onChange={setAdvertising} />
            <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
              {tools.filter((tool) => tool.enabled).map((tool) => (
                <li key={tool.slug}>{tool.name} ({tool.company}): {tool.purpose}</li>
              ))}
            </ul>
            <div className="mt-4 grid gap-2">
              <Button type="button" variant="outline" onClick={() => save("custom", version, gpc, { analytics, advertising })}>Save my choices</Button>
              <Button type="button" variant="outline" onClick={() => save("accept", version, gpc)}>Accept all</Button>
              <Button type="button" variant="outline" onClick={() => save("reject", version, gpc)}>Reject all</Button>
              <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setOpen(false)}>Close</button>
            </div>
            {blocked ? <p className="mt-2 text-xs text-muted-foreground">We could not save a choice in this browser. Optional tools stay off.</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Category({
  title,
  body,
  locked,
  checked,
  onChange,
}: {
  title: string;
  body: string;
  locked?: boolean;
  checked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className="mt-4 flex items-start justify-between gap-3 text-sm text-muted-foreground">
      <span>
        <span className="block text-strong">{title}</span>
        {body}
      </span>
      <input type="checkbox" className="mt-1" checked={locked ? true : checked} disabled={locked} onChange={(event) => onChange?.(event.target.checked)} />
    </label>
  );
}

export function OpenConsentButton({ label = "Cookie preferences", className }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      className={cn("text-sm text-muted-foreground hover:text-brand-300", className)}
      onClick={() => window.dispatchEvent(new Event("vistrial-open-consent"))}
    >
      {label}
    </button>
  );
}
