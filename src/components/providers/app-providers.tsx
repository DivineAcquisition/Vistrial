"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { authAppearance } from "@/components/auth/appearance";
import { ConvexReadyProvider } from "@/components/providers/convex-ready";

const clients = new Map<string, ConvexReactClient>();

function clientFor(url: string) {
  const existing = clients.get(url);
  if (existing) return existing;
  const client = new ConvexReactClient(url);
  clients.set(url, client);
  return client;
}

export function AppProviders({ children, clerk = false }: { children: React.ReactNode; clerk?: boolean }) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!clerk || !key || !url) return children;
  return (
    <ClerkProvider publishableKey={key} appearance={authAppearance}>
      <ConvexProviderWithClerk client={clientFor(url)} useAuth={useAuth}>
        <ConvexReadyProvider>{children}</ConvexReadyProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
