"use client";

import { useMemo } from "react";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
import { labelClass } from "@/lib/ui";

export type MemberOption = {
  id: string;
  displayName: string;
};

type Item = { value: string; label: string };

const NONE = "__none__";

export function MemberCombobox({
  label,
  value,
  onChange,
  members,
  allowEmpty = true,
  emptyLabel = "Unassigned",
  placeholder = "Search people",
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  members: MemberOption[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  id?: string;
}) {
  const items = useMemo<Item[]>(() => {
    const people = members.map((member) => ({
      value: member.id,
      label: member.displayName,
    }));
    return allowEmpty ? [{ value: NONE, label: emptyLabel }, ...people] : people;
  }, [allowEmpty, emptyLabel, members]);

  const selected = items.find((item) => item.value === (value || NONE)) ?? null;

  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <Combobox
        isItemEqualToValue={(a, b) => a.value === b.value}
        items={items}
        onValueChange={(item) => onChange(!item || item.value === NONE ? "" : item.value)}
        value={selected}
      >
        <ComboboxInput id={id} placeholder={placeholder} showClear={allowEmpty} />
        <ComboboxPopup>
          <ComboboxEmpty>No matching people.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
    </label>
  );
}
