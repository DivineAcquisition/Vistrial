"use client";

import { useState } from "react";
import {
  RiUserAddLine,
  RiLoader4Line,
  RiMailLine,
  RiDeleteBinLine,
  RiShieldUserLine,
  RiTimeLine,
} from "@remixicon/react";
import { inviteTeamMember, removeTeamMember, updateTeamMemberRole, revokeInvitation } from "@/lib/auth/actions";
import { cn } from "@/lib/utils/cn";

interface Member {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  is_active: boolean;
  joined_at: string;
  last_active_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface TeamManagementProps {
  businessId: string;
  currentUserRole: string;
  members: Member[];
  invitations: Invitation[];
}

export function TeamManagement({
  businessId,
  currentUserRole,
  members,
  invitations,
}: TeamManagementProps) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canManageTeam = ["owner", "admin"].includes(currentUserRole);
  const isOwner = currentUserRole === "owner";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const result = await inviteTeamMember({
      email: inviteEmail,
      role: inviteRole,
      businessId,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("Invitation sent successfully!");
      setInviteEmail("");
      setShowInviteForm(false);
    }

    setLoading(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;

    setLoading(true);
    const result = await removeTeamMember(memberId);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleRoleChange = async (memberId: string, newRole: "admin" | "staff") => {
    setLoading(true);
    const result = await updateTeamMemberRole(memberId, newRole);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleRevokeInvite = async (invitationId: string) => {
    if (!confirm("Are you sure you want to revoke this invitation?")) return;

    setLoading(true);
    const result = await revokeInvitation(invitationId);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-violet-100 text-violet-700";
      case "admin":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-slate-400 mt-1">Manage your team members and invitations</p>
        </div>
        {canManageTeam && (
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
          >
            <RiUserAddLine className="w-5 h-5" />
            Invite Member
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
          {success}
        </div>
      )}

      {/* Invite Form */}
      {showInviteForm && canManageTeam && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Invite a team member</h3>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email address
                </label>
                <div className="relative">
                  <RiMailLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "staff")}
                  className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowInviteForm(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50"
              >
                {loading ? (
                  <RiLoader4Line className="w-5 h-5 animate-spin" />
                ) : (
                  "Send Invitation"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <RiTimeLine className="w-5 h-5 text-slate-400" />
              Pending Invitations ({invitations.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-700">
            {invitations.map((invite) => (
              <div key={invite.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{invite.email}</p>
                  <p className="text-sm text-slate-400">
                    Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getRoleBadgeColor(invite.role))}>
                    {invite.role}
                  </span>
                  {canManageTeam && (
                    <button
                      onClick={() => handleRevokeInvite(invite.id)}
                      className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      title="Revoke invitation"
                    >
                      <RiDeleteBinLine className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <RiShieldUserLine className="w-5 h-5 text-slate-400" />
            Team Members ({members.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-700">
          {members.map((member) => (
            <div key={member.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium">
                    {(member.display_name || "U")[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-white">
                    {member.display_name || "Unknown"}
                  </p>
                  <p className="text-sm text-slate-400">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isOwner && member.role !== "owner" ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as "admin" | "staff")}
                    className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getRoleBadgeColor(member.role))}>
                    {member.role}
                  </span>
                )}
                {canManageTeam && member.role !== "owner" && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                    title="Remove member"
                  >
                    <RiDeleteBinLine className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Role Descriptions */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
        <h3 className="font-semibold text-white mb-4">Role Permissions</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium text-violet-400 mb-2">Owner</p>
            <ul className="text-slate-400 space-y-1">
              <li>• Full account access</li>
              <li>• Manage billing</li>
              <li>• Delete business</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-blue-400 mb-2">Admin</p>
            <ul className="text-slate-400 space-y-1">
              <li>• Manage team members</li>
              <li>• Manage settings</li>
              <li>• View all data</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-400 mb-2">Staff</p>
            <ul className="text-slate-400 space-y-1">
              <li>• View bookings</li>
              <li>• Manage customers</li>
              <li>• Limited settings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
