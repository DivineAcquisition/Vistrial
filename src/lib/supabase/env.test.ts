import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  supabasePublishableKey,
  supabasePublishableKeyKind,
  supabaseUrl,
} from "@/lib/supabase/env";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("supabase env", () => {
  it("reads public URL from the static NEXT_PUBLIC name first", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://jizzmlvpnykazrsiotqq.supabase.co",
        SUPABASE_URL: "https://example.invalid",
      },
      () => {
        expect(supabaseUrl()).toBe("https://jizzmlvpnykazrsiotqq.supabase.co");
      }
    );
  });

  it("prefers the classic JWT anon key over a Marketplace publishable key", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      () => {
        expect(supabasePublishableKey()).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon");
        expect(supabasePublishableKeyKind()).toBe("anon_jwt");
      }
    );
  });

  it("keeps static NEXT_PUBLIC identifiers so Next inlines them in the browser", () => {
    const src = readFileSync(resolve("src/lib/supabase/env.ts"), "utf8");
    expect(src).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(src).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const body = src.slice(src.indexOf("function firstPresent"));
    expect(body).not.toMatch(/process\.env\[name\]/);
    const keyFn = src.slice(src.indexOf("export function supabasePublishableKey"));
    expect(keyFn.indexOf("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBeLessThan(
      keyFn.indexOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    );
  });
});
