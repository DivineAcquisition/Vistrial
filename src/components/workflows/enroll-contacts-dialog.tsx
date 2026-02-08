'use client';

// ============================================
// ENROLL CONTACTS INTO WORKFLOW DIALOG
// ============================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Search, AlertTriangle } from 'lucide-react';

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  status: string;
}

interface EnrollContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  workflowName: string;
}

export function EnrollContactsDialog({ open, onOpenChange, workflowId, workflowName }: EnrollContactsDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  useEffect(() => {
    if (open) fetchContacts();
  }, [open]);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/contacts?status=active&limit=500');
      const data = await response.json();
      setContacts(data.contacts || data.data || []);
    } catch {
      toast({ title: 'Failed to load contacts', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredContacts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
  };

  const handleEnroll = async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'Select at least one contact', variant: 'destructive' });
      return;
    }
    setIsEnrolling(true);
    try {
      const response = await fetch('/api/workflows/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, contactIds: Array.from(selectedIds) }),
      });
      if (!response.ok) throw new Error('Enrollment failed');
      const data = await response.json();
      toast({ title: 'Contacts enrolled!', description: `${data.enrolled} contacts added to campaign` });
      onOpenChange(false);
      router.refresh();
    } catch {
      toast({ title: 'Enrollment failed', description: 'Please try again', variant: 'destructive' });
    } finally {
      setIsEnrolling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Launch Campaign</DialogTitle>
          <DialogDescription>Select contacts to enroll in &ldquo;{workflowName}&rdquo;</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search contacts..." className="pl-10" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length} onCheckedChange={selectAll} />
              <Label className="text-sm">Select all ({filteredContacts.length})</Label>
            </div>
            <Badge variant="secondary">{selectedIds.size} selected</Badge>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No contacts found</p>
              <p className="text-sm mt-1">Add contacts first to enroll them in campaigns</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] border rounded-xl">
              <div className="divide-y divide-gray-100">
                {filteredContacts.map((contact) => (
                  <label key={contact.id} className="flex items-center gap-4 p-3 hover:bg-gray-50 cursor-pointer">
                    <Checkbox checked={selectedIds.has(contact.id)} onCheckedChange={() => toggleSelect(contact.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{contact.first_name} {contact.last_name}</p>
                      <p className="text-xs text-gray-500 truncate">{contact.phone}{contact.email && ` \u2022 ${contact.email}`}</p>
                    </div>
                    <Badge variant={contact.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{contact.status}</Badge>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">This will send messages to {selectedIds.size} contacts</p>
                <p className="text-amber-700 text-xs">Make sure your workflow is ready before launching</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleEnroll} disabled={selectedIds.size === 0 || isEnrolling} variant="gradient">
            {isEnrolling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Launch Campaign ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
