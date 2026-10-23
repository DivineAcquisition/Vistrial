"use server";

import { cookies } from "next/headers";

const SETUP_COOKIE = "vistrial-setup-done";

export async function markSetupDone() {
  const jar = await cookies();
  jar.set(SETUP_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
}

export async function clearSetupDone() {
  const jar = await cookies();
  jar.delete(SETUP_COOKIE);
}

export async function setupIsDone() {
  const jar = await cookies();
  return jar.get(SETUP_COOKIE)?.value === "1";
}
