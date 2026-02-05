// @ts-nocheck
'use client';

// ============================================
// WORKFLOW ACTIONS DROPDOWN
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal, Play, Pause, Archive, Settings, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface WorkflowActionsProps {
  workflow: {
    id: string;
    name: string;
    status: string;
  };
}

export function WorkflowActions({ workflow }: WorkflowActionsProps) {
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleAction = async (action: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Action failed');
      }

      toast({
        title: 'Success',
        description: `Workflow ${action === 'activate' ? 'activated' : action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'archived'}`,
      });

      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Action failed',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setArchiveDialogOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white" disabled={isLoading}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gray-900 border-white/10">
          {workflow.status === 'draft' && (
            <DropdownMenuItem onClick={() => handleAction('activate')} className="text-gray-300 focus:text-white focus:bg-white/5">
              <Play className="h-4 w-4 mr-2" />
              Activate
            </DropdownMenuItem>
          )}
          {workflow.status === 'active' && (
            <DropdownMenuItem onClick={() => handleAction('pause')} className="text-gray-300 focus:text-white focus:bg-white/5">
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </DropdownMenuItem>
          )}
          {workflow.status === 'paused' && (
            <DropdownMenuItem onClick={() => handleAction('resume')} className="text-gray-300 focus:text-white focus:bg-white/5">
              <Play className="h-4 w-4 mr-2" />
              Resume
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push(`/workflows/${workflow.id}/enroll`)} className="text-gray-300 focus:text-white focus:bg-white/5">
            <Users className="h-4 w-4 mr-2" />
            Enroll Contacts
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/workflows/${workflow.id}/settings`)} className="text-gray-300 focus:text-white focus:bg-white/5">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem
            onClick={() => setArchiveDialogOpen(true)}
            className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
          >
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent className="bg-gray-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Archive Workflow</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to archive &ldquo;{workflow.name}&rdquo;? All active enrollments
              will be completed and no new messages will be sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading} className="border-white/10 bg-gray-800 text-gray-300 hover:bg-gray-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction('archive')}
              disabled={isLoading}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isLoading ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
