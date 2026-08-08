import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchForSupabaseKey } from "@/lib/supabase/fetch";

describe("fetchForSupabaseKey", () => {
  it("strips new-format secret keys from Authorization Bearer", async () => {
    const key = "sb_secret_test_value";
    let seen: Headers | undefined;
    const wrapped = fetchForSupabaseKey(key, (async (_input, init) => {
      seen = new Headers(init?.headers);
      return new Response("{}", { status: 200 });
    }) as typeof fetch);

    await wrapped("https://example.test/rest/v1/x", {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    assert.equal(seen?.get("apikey"), key);
    assert.equal(seen?.has("Authorization"), false);
  });

  it("leaves classic JWT service-role Bearer headers alone", async () => {
    const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service.role";
    let seen: Headers | undefined;
    const wrapped = fetchForSupabaseKey(key, (async (_input, init) => {
      seen = new Headers(init?.headers);
      return new Response("{}", { status: 200 });
    }) as typeof fetch);

    await wrapped("https://example.test/rest/v1/x", {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    assert.equal(seen?.get("Authorization"), `Bearer ${key}`);
  });

  it("keeps a real user access token Bearer header", async () => {
    const key = "sb_publishable_test_value";
    const userJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user.token";
    let seen: Headers | undefined;
    const wrapped = fetchForSupabaseKey(key, (async (_input, init) => {
      seen = new Headers(init?.headers);
      return new Response("{}", { status: 200 });
    }) as typeof fetch);

    await wrapped("https://example.test/auth/v1/user", {
      headers: {
        apikey: key,
        Authorization: `Bearer ${userJwt}`,
      },
    });

    assert.equal(seen?.get("Authorization"), `Bearer ${userJwt}`);
  });
});
