import { LogOutIcon } from "lucide-react";

import { signOutAction } from "@/lib/actions/auth";
import { btnGhost, btnSizeSm } from "@/lib/ui";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className={`${btnGhost} ${btnSizeSm} px-2`}>
        <LogOutIcon className="size-3.5" />
        Sign out
      </button>
    </form>
  );
}
