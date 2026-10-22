"use client";

import { useTransition } from "react";

import { setAgentHiddenAction } from "@/app/(workspace)/app/agents/roster-actions";
import { useAgentSummary } from "@/components/agents/summary-context";
import { MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from "@/components/ui/menu";

/** In the account menu: agents the Owner hid from their own sidebar, each with "Show again". */
export function HiddenAgentItems() {
  const { summary, refresh } = useAgentSummary();
  const [, start] = useTransition();
  const hidden = (summary?.agents ?? []).filter((row) => row.hidden && summary?.sidebar);
  if (!hidden.length) return null;
  return (
    <>
      <MenuSeparator />
      <MenuGroup>
        <MenuGroupLabel className="font-normal">Hidden from your sidebar</MenuGroupLabel>
        {hidden.map((row) => (
          <MenuItem
            key={row.id}
            onClick={() =>
              start(async () => {
                await setAgentHiddenAction(row.id, false);
                refresh();
              })
            }
          >
            Show {row.name} again
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
    </>
  );
}
