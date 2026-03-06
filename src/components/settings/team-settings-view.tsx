'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Loader2, Mail, Users, CheckCircle, Crown, Shield, MoreVertical, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type MemberRole, type TeamMember } from '@/lib/team/members';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700', admin: 'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700', viewer: 'bg-gray-100 text-gray-600',
};

interface TeamSettingsViewProps {
  members: TeamMember[];
  currentUserId: string;
  currentUserRole: MemberRole;
  canInvite: boolean;
  usageCheck: any;
  teamLimit: number;
  organizationName: string;
}

export function TeamSettingsView({ members, currentUserId, currentUserRole, canInvite, usageCheck, teamLimit, organizationName }: TeamSettingsViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingMembers = members.filter((m) => m.status === 'invited');

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      const res = await fetch('/api/team/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: 'Invitation sent!', description: `Sent to ${inviteEmail}` });
      setInviteEmail(''); setIsInviteOpen(false); router.refresh();
    } catch (error) { toast({ title: 'Failed', description: error instanceof Error ? error.message : 'Try again', variant: 'destructive' }); }
    finally { setIsInviting(false); }
  };

  const handleRemove = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from the team?`)) return;
    setLoadingId(memberId);
    try {
      const res = await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast({ title: 'Member removed' }); router.refresh();
    } catch (error) { toast({ title: 'Failed', description: error instanceof Error ? error.message : 'Try again', variant: 'destructive' }); }
    finally { setLoadingId(null); }
  };

  const handleRoleChange = async (memberId: string, role: MemberRole) => {
    setLoadingId(memberId);
    try {
      const res = await fetch(`/api/team/members/${memberId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast({ title: 'Role updated' }); router.refresh();
    } catch (error) { toast({ title: 'Failed', description: error instanceof Error ? error.message : 'Try again', variant: 'destructive' }); }
    finally { setLoadingId(null); }
  };

  const getName = (m: TeamMember) => m.email?.split('@')[0] || 'User';
  const getInitials = (m: TeamMember) => m.email?.substring(0, 2).toUpperCase() || '??';
  const canManage = (m: TeamMember) => m.role !== 'owner' && m.userId !== currentUserId && (currentUserRole === 'owner' || (currentUserRole === 'admin' && m.role !== 'admin'));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500 mt-1">Manage who has access to {organizationName}</p>
        </div>
        {canInvite && (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button disabled={!usageCheck.allowed} variant="gradient" className="rounded-xl">
                <UserPlus className="h-4 w-4 mr-2" /> Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>Send an invitation to join {organizationName}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as MemberRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['admin', 'member', 'viewer'] as MemberRole[]).map((r) => (
                        <SelectItem key={r} value={r}><span className="font-medium">{ROLE_LABELS[r]}</span> - <span className="text-gray-500 text-xs">{ROLE_DESCRIPTIONS[r]}</span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}>
                  {isInviting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send Invitation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { icon: Users, color: 'blue', label: 'Active Members', value: activeMembers.length },
          { icon: Mail, color: 'amber', label: 'Pending Invites', value: pendingMembers.length },
          { icon: CheckCircle, color: 'green', label: 'Seats Used', value: `${members.length} / ${teamLimit === -1 ? '\u221e' : teamLimit}` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl bg-${s.color}-50 flex items-center justify-center`}>
                  <s.icon className={`h-5 w-5 text-${s.color}-600`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Members</CardTitle>
          <CardDescription>People who have access to this organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {activeMembers.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No team members yet</p>}
            {activeMembers.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-brand-50 text-brand-600">{getInitials(m)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{getName(m)}</p>
                      {m.userId === currentUserId && <Badge variant="outline" className="text-[10px]">You</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={ROLE_COLORS[m.role] || ROLE_COLORS.member}>
                    {m.role === 'owner' && <Crown className="h-3 w-3 mr-1" />}
                    {ROLE_LABELS[m.role] || m.role}
                  </Badge>
                  {canManage(m) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={loadingId === m.id}>
                          {loadingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRoleChange(m.id, 'admin')} disabled={m.role === 'admin'}><Shield className="h-4 w-4 mr-2" />Make Admin</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRoleChange(m.id, 'member')} disabled={m.role === 'member'}><Users className="h-4 w-4 mr-2" />Make Member</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRoleChange(m.id, 'viewer')} disabled={m.role === 'viewer'}><Users className="h-4 w-4 mr-2" />Make Viewer</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => handleRemove(m.id, getName(m))}><Trash2 className="h-4 w-4 mr-2" />Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {pendingMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-dashed border-gray-200">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9"><AvatarFallback className="text-xs bg-gray-100 text-gray-500">{getInitials(m)}</AvatarFallback></Avatar>
                    <div>
                      <p className="font-medium text-sm">{m.email}</p>
                      <p className="text-[11px] text-gray-400">Invited {m.invitedAt ? new Date(m.invitedAt).toLocaleDateString() : 'recently'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={ROLE_COLORS[m.role] || ROLE_COLORS.member}>{ROLE_LABELS[m.role] || m.role}</Badge>
                    {canInvite && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleRemove(m.id, m.email)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role descriptions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Role Permissions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(['owner', 'admin', 'member', 'viewer'] as MemberRole[]).map((r) => (
              <div key={r} className="p-3 rounded-xl border border-gray-100">
                <Badge className={ROLE_COLORS[r] + ' mb-2'}>{r === 'owner' && <Crown className="h-3 w-3 mr-1" />}{ROLE_LABELS[r]}</Badge>
                <p className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
