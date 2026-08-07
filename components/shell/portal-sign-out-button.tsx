import { LogOutIcon } from "lucide-react";

import { signOutPortalAction } from "@/lib/actions/auth";
import { btnGhost, btnSizeSm } from "@/lib/ui";

export function PortalSignOutButton() {
  return (
    <form action={signOutPortalAction}>
      <button type="submit" className={`${btnGhost} ${btnSizeSm} px-2`}>
        <LogOutIcon className="size-3.5" />
        Sign out
      </button>
    </form>
  );
}
