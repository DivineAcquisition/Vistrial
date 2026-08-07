"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  changeTeamRoleAction,
  deactivateTeamUserAction,
  forcePasswordResetAction,
  reactivateTeamUserAction,
  requireMfaResetAction,
  revokeAllSessionsAction,
  unlockTeamUserAction,
} from "@/lib/actions/team";
import { btnSecondary, btnSizeSm, selectClass } from "@/lib/ui";
import type { TeamRole, TeamUser } from "@/types/database";

export function UserActions({
  user,
  actorRole,
  isSelf,
}: {
  user: TeamUser;
  actorRole: TeamRole;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Request refused.");
        return;
      }
      toast.success(label);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {!isSelf ? (
        <select
          className={`${selectClass} w-36`}
          disabled={pending}
          defaultValue={user.role}
          onChange={(e) =>
            run("Role updated", () =>
              changeTeamRoleAction({ id: user.id, role: e.target.value })
            )
          }
        >
          {actorRole === "owner" ? <option value="owner">Owner</option> : null}
          <option value="admin">Admin</option>
          <option value="member">Member</option>
        </select>
      ) : null}

      {user.status === "active" && !isSelf ? (
        <button
          type="button"
          disabled={pending}
          className={`${btnSecondary} ${btnSizeSm}`}
          onClick={() =>
            run("User deactivated", () =>
              deactivateTeamUserAction({ id: user.id })
            )
          }
        >
          Deactivate
        </button>
      ) : null}

      {user.status === "deactivated" ? (
        <button
          type="button"
          disabled={pending}
          className={`${btnSecondary} ${btnSizeSm}`}
          onClick={() =>
            run("User reactivated", () =>
              reactivateTeamUserAction({ id: user.id })
            )
          }
        >
          Reactivate
        </button>
      ) : null}

      {user.status === "locked" ? (
        <button
          type="button"
          disabled={pending}
          className={`${btnSecondary} ${btnSizeSm}`}
          onClick={() =>
            run("Account unlocked", () => unlockTeamUserAction({ id: user.id }))
          }
        >
          Unlock
        </button>
      ) : null}

      <button
        type="button"
        disabled={pending}
        className={`${btnSecondary} ${btnSizeSm}`}
        onClick={() =>
          run("Password reset required at next sign in", () =>
            forcePasswordResetAction({ id: user.id })
          )
        }
      >
        Force password reset
      </button>

      <button
        type="button"
        disabled={pending}
        className={`${btnSecondary} ${btnSizeSm}`}
        onClick={() =>
          run("Two-factor reset required", () =>
            requireMfaResetAction({ id: user.id })
          )
        }
      >
        Reset 2FA
      </button>

      <button
        type="button"
        disabled={pending}
        className={`${btnSecondary} ${btnSizeSm}`}
        onClick={() =>
          run("All sessions revoked", () =>
            revokeAllSessionsAction({ id: user.id })
          )
        }
      >
        Revoke sessions
      </button>
    </div>
  );
}
