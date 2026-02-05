// @ts-nocheck
'use client';

// ============================================
// CONTACTS PAGE HEADER
// ============================================

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Upload, Users } from 'lucide-react';
import { AddContactForm } from './add-contact-form';

interface ContactsHeaderProps {
  organizationId: string;
}

export function ContactsHeader({ organizationId }: ContactsHeaderProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
          <Users className="h-6 w-6" />
          Contacts
        </h1>
        <p className="text-gray-400">
          Manage your contact database and enrollments
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/contacts/upload">
          <Button variant="outline" className="border-white/10 bg-gray-900 hover:bg-gray-800 text-gray-300">
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </Link>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">Add New Contact</DialogTitle>
              <DialogDescription className="text-gray-400">
                Add a single contact to your database
              </DialogDescription>
            </DialogHeader>
            <AddContactForm
              organizationId={organizationId}
              onSuccess={() => setAddDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
