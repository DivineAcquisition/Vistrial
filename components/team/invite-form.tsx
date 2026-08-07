"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { inviteTeamUserAction } from "@/lib/actions/team";
import {
  btnPrimary,
  btnSizeSm,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";
import type { TeamRole } from "@/types/database";

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await inviteTeamUserAction({
            email: form.get("email"),
            role: form.get("role"),
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Invitation sent to ${result.data.email}`);
          event.currentTarget.reset();
        });
      }}
    >
      <div className="min-w-[220px] flex-1">
        <label className={labelClass} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={inputClass}
        />
      </div>
      <div className="w-40">
        <label className={labelClass} htmlFor="role">
          Role
        </label>
        <select id="role" name="role" className={selectClass} defaultValue="member">
          {canInviteOwner ? <option value="owner">Owner</option> : null}
          <option value="admin">Admin</option>
          <option value="member">Member</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
      >
        Invite
      </button>
    </form>
  );
}

export function roleLabel(role: TeamRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}
