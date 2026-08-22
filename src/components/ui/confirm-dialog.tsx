"use client";

import { useState, type ReactNode } from "react";

import { Button, type ButtonVariant } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * A second look before something consequential.
 *
 * Only for an action that is hard to undo. Putting one in front of a routine
 * save teaches people to click through it, which is exactly the habit you do
 * not want when a real one appears.
 *
 * The confirm button repeats the verb rather than saying "OK", so the dialog
 * still makes sense to someone who skimmed the question.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "destructive",
  onConfirm,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void | Promise<void>;
  /** Anything extra the reader needs, such as what exactly will change. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={working}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            loading={working}
            loadingLabel="Working"
            onClick={async () => {
              setWorking(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setWorking(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
