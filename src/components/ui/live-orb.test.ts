import { describe, expect, it } from "vitest";

import { AGENT_ACCENT_KEYS, AGENT_ORB_COLORS } from "@/lib/agents/roster";
import { defaultVariant, resolveVariant } from "@/components/ui/live-orb";

describe("live orb", () => {
  it("follows the theme when no variant is set", () => {
    expect(defaultVariant(true)).toBe("white");
    expect(defaultVariant(false)).toBe("black");
    expect(resolveVariant(undefined, undefined, undefined, undefined, false).body).toBe("#18181B");
    expect(resolveVariant(undefined, undefined, undefined, undefined, true).body).toBe("#F4F4F5");
  });

  it("gives every agent accent its own wash", () => {
    for (const accent of AGENT_ACCENT_KEYS) {
      const colors = AGENT_ORB_COLORS[accent];
      expect(colors).toHaveLength(3);
      const resolved = resolveVariant("webgl", undefined, undefined, colors);
      expect(resolved.mode).toBe(1);
      expect(resolved.palette).toEqual(colors);
      expect(resolved.eye).toBe("#0C0C10");
    }
  });
});
