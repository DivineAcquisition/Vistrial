"use client";

import { useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonVariant } from "@/components/ui/button";

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
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (working) return;
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children ? <div className="px-6">{children}</div> : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" disabled={working} />}>
            {cancelLabel}
          </AlertDialogClose>
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
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
