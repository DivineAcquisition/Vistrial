"use client";

import { useClerk, useReverification, useSession, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { SecurityView, type ConfirmState, type SecurityBusy, type SecurityPanel } from "@/components/account/security-view";
import {
  deviceRows,
  explainAccountError,
  isConfirmCancelled,
  resendConfirmCode,
  startConfirm,
  submitConfirm,
  switchConfirmSecond,
  type ConfirmSecondMethod,
  type DeviceRow,
} from "@/lib/auth/account";
import type { AuthProblem } from "@/lib/auth/errors";

const NOTHING_CAME_BACK: AuthProblem = { field: "form", message: "That did not work. Try again in a moment." };

type Level = "first_factor" | "second_factor" | "multi_factor" | undefined;
type Pending = { complete: () => void; cancel: () => void; level: Level };

/**
 * Password, two-step sign-in and signed-in devices for the person who is signed in. Clerk makes the
 * changes and decides when to ask "is it really you"; the screens, including that check, are ours.
 */
export function AccountSecurity() {
  const clerk = useClerk();
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const [panel, setPanel] = useState<SecurityPanel>(null);
  const [busy, setBusy] = useState<SecurityBusy>(null);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const pending = useRef<Pending | null>(null);

  /** Clerk wants a fresh check before the change. Open our own window for it. */
  const onNeedsReverification = useCallback(
    ({ complete, cancel, level }: Pending) => {
      pending.current = { complete, cancel, level };
      setConfirm({ step: { kind: "done" }, problem: null, busy: true, sentCount: 0 });
      if (!session) return cancel();
      void startConfirm(session, level).then((outcome) => setConfirm({ ...outcome, busy: false, sentCount: 1 }));
    },
    [session],
  );
  const guard = { onNeedsReverification };

  const updatePassword = useReverification(
    (params: { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean }) => user?.updatePassword(params),
    guard,
  );
  const createTotp = useReverification(() => user?.createTOTP(), guard);
  const verifyTotp = useReverification((code: string) => user?.verifyTOTP({ code }), guard);
  const disableTotp = useReverification(() => user?.disableTOTP(), guard);
  const createBackupCodes = useReverification(() => user?.createBackupCode(), guard);

  const sessionId = session?.id ?? null;
  const loadDevices = useCallback(async () => {
    if (!user) return;
    const rows = await user
      .getSessions()
      .then((all) => deviceRows(all, sessionId, Date.now()))
      .catch(() => []);
    setDevices(rows);
  }, [sessionId, user]);

  useEffect(() => {
    if (!user) return;
    let live = true;
    user
      .getSessions()
      .then((all) => deviceRows(all, sessionId, Date.now()))
      .catch(() => [])
      .then((rows) => live && setDevices(rows));
    return () => {
      live = false;
    };
  }, [sessionId, user]);

  /** Runs one change: spinner on, words for a failure, nothing at all when the person backed out of the check. */
  const run = useCallback(async (kind: Exclude<SecurityBusy, null>, work: () => Promise<void>, field: AuthProblem["field"] = "form", currentPassword = false) => {
    setBusy(kind);
    setProblem(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      if (!isConfirmCancelled(error)) setProblem(explainAccountError(error, field, currentPassword));
    } finally {
      setBusy(null);
    }
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirm(null);
    pending.current = null;
  }, []);

  const hasPassword = Boolean(user?.passwordEnabled);

  return (
    <SecurityView
      ready={isLoaded && clerk.loaded && Boolean(user)}
      hasPassword={hasPassword}
      twoStepOn={Boolean(user?.totpEnabled)}
      hasBackupCodes={Boolean(user?.backupCodeEnabled)}
      devices={devices}
      panel={panel}
      busy={busy}
      problem={problem}
      notice={notice}
      confirm={confirm}
      onOpenPassword={() => {
        setProblem(null);
        setNotice(null);
        setPanel({ kind: "password" });
      }}
      onPassword={({ current, next }) =>
        void run(
          "password",
          async () => {
            await updatePassword({ ...(hasPassword ? { currentPassword: current } : {}), newPassword: next, signOutOfOtherSessions: true });
            await user?.reload();
            setPanel(null);
            setNotice(hasPassword ? "Password changed. Other devices were signed out." : "Password set. You can now sign in with it.");
            void loadDevices();
          },
          "password",
          hasPassword,
        )
      }
      onStartTwoStep={() =>
        void run("totp-start", async () => {
          const totp = await createTotp();
          if (totp?.uri && totp.secret) setPanel({ kind: "totp-setup", uri: totp.uri, secret: totp.secret });
          else setProblem(NOTHING_CAME_BACK);
        })
      }
      onVerifyTwoStep={(code) =>
        void run(
          "totp-verify",
          async () => {
            const totp = await verifyTotp(code);
            // Clerk hands over the first backup codes with the confirmation when it has them.
            const codes = totp?.backupCodes?.length ? totp.backupCodes : ((await createBackupCodes())?.codes ?? []);
            await user?.reload();
            setNotice("Two-step sign-in is on.");
            setPanel(codes.length ? { kind: "backup-codes", codes, fresh: true } : null);
          },
          "code",
        )
      }
      onNewBackupCodes={() =>
        void run("backup", async () => {
          const made = await createBackupCodes();
          await user?.reload();
          if (made?.codes?.length) setPanel({ kind: "backup-codes", codes: made.codes, fresh: false });
          else setProblem(NOTHING_CAME_BACK);
        })
      }
      onAskTurnOff={() => {
        setProblem(null);
        setPanel({ kind: "totp-off" });
      }}
      onTurnOff={() =>
        void run("totp-off", async () => {
          await disableTotp();
          await user?.reload();
          setPanel(null);
          setNotice("Two-step sign-in is off.");
        })
      }
      onClosePanel={() => {
        setPanel(null);
        setProblem(null);
      }}
      onSignOutDevice={(id) =>
        void run(`device:${id}`, async () => {
          const all = (await user?.getSessions()) ?? [];
          await all.find((item) => item.id === id)?.revoke();
          setNotice("That device was signed out.");
          await loadDevices();
        })
      }
      onConfirmSubmit={async (value) => {
        if (!session || !confirm) return;
        setConfirm({ ...confirm, busy: true, problem: null });
        const outcome = await submitConfirm(session, confirm.step, value);
        if (outcome.step.kind === "done") {
          const waiting = pending.current;
          closeConfirm();
          waiting?.complete();
          return;
        }
        setConfirm({ ...outcome, busy: false, sentCount: confirm.sentCount + (outcome.step.kind !== confirm.step.kind ? 1 : 0) });
      }}
      onConfirmResend={async () => {
        if (!session || !confirm) return;
        setConfirm({ ...confirm, busy: true });
        const failed = await resendConfirmCode(session, confirm.step);
        setConfirm({ ...confirm, busy: false, problem: failed, sentCount: confirm.sentCount + (failed ? 0 : 1) });
      }}
      onConfirmSwitch={async (to: "password" | "code" | ConfirmSecondMethod) => {
        if (!session || !confirm) return;
        setConfirm({ ...confirm, busy: true, problem: null });
        const outcome =
          confirm.step.kind === "second" && to !== "password" && to !== "code"
            ? await switchConfirmSecond(session, confirm.step, to)
            : await startConfirm(session, pending.current?.level, to);
        setConfirm({ ...outcome, busy: false, sentCount: confirm.sentCount + 1 });
      }}
      onConfirmCancel={() => {
        const waiting = pending.current;
        closeConfirm();
        waiting?.cancel();
      }}
    />
  );
}
