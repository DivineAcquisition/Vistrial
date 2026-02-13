// @ts-nocheck
'use client';

// ============================================
// ENROLL CONTACTS INTO WORKFLOW DIALOG
// ============================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Users,
  Search,
  AlertTriangle,
  CheckCircle2,
  Zap,
} from 'lucide-react';

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

export function EnrollContactsDialog({
  open,
  onOpenChange,
  workflowId,
  workflowName,
}: EnrollContactsDialogProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      fetchContacts();
      setSelectedIds(new Set());
      setEnrollmentResult(null);
    }
  }, [open]);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/contacts?status=active&limit=500');
      const data = await response.json();
      setContacts(data.contacts || []);
    } catch (error) {
      toast({ title: 'Failed to load contacts', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    const query = searchQuery.toLowerCase();
    return (
      contact.first_name?.toLowerCase().includes(query) ||
      contact.last_name?.toLowerCase().includes(query) ||
      contact.phone?.includes(query) ||
      contact.email?.toLowerCase().includes(query)
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
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
    }
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

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Enrollment failed');
      }

      const data = await response.json();
      setEnrollmentResult(data);

      toast({
        title: 'Campaign launched!',
        description: `${data.enrolled} contacts enrolled`,
      });
    } catch (error) {
      toast({
        title: 'Enrollment failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleClose = () => {
    if (enrollmentResult) router.refresh();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Launch Campaign
          </DialogTitle>
          <DialogDescription>
            Select contacts to enroll in &quot;{workflowName}&quot;
          </DialogDescription>
        </DialogHeader>

        {!enrollmentResult ? (
          <>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="pl-10"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length}
                    onCheckedChange={selectAll}
                  />
                  <span className="text-sm">Select all ({filteredContacts.length})</span>
                </label>
                <Badge variant="secondary" className="font-mono">
                  {selectedIds.size} selected
                </Badge>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No contacts found</p>
                  <Button
                    variant="link"
                    onClick={() => { onOpenChange(false); router.push('/contacts'); }}
                    className="mt-2"
                  >
                    Add contacts first
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[300px] border rounded-lg">
                  <div className="divide-y">
                    {filteredContacts.map((contact) => (
                      <label
                        key={contact.id}
                        className="flex items-center gap-4 p-3 hover:bg-muted cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {contact.first_name} {contact.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {contact.phone}
                            {contact.email && ` \u2022 ${contact.email}`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {selectedIds.size > 0 && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg text-sm">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Ready to send messages to {selectedIds.size} contacts
                    </p>
                    <p className="text-amber-700 dark:text-amber-300 mt-1">
                      Messages will start sending immediately. Make sure your workflow is ready.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleEnroll} disabled={selectedIds.size === 0 || isEnrolling}>
                {isEnrolling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                Launch ({selectedIds.size})
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="py-8 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h3 className="text-xl font-semibold">Campaign Launched!</h3>
              <p className="text-muted-foreground mt-2">Your messages are being sent</p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{enrollmentResult.enrolled}</p>
                <p className="text-xs text-green-600">Enrolled</p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{enrollmentResult.skipped}</p>
                <p className="text-xs text-amber-600">Skipped</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{enrollmentResult.enrolled + enrollmentResult.skipped}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>

            {enrollmentResult.skipped > 0 && (
              <p className="text-sm text-muted-foreground">
                {enrollmentResult.skipped} contacts were skipped (already enrolled or unsubscribed)
              </p>
            )}

            <Button onClick={handleClose} className="mt-4">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
