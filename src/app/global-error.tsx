"use client";

import Logo from "@/components/brand/logo";
import "./globals.css";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body className="min-h-screen bg-background font-body text-foreground antialiased">
        <div className="mx-auto max-w-lg px-6 py-16">
          <Logo className="h-7 w-auto" />
          <p className="mt-8 font-heading text-sm text-white">Vistrial failed to load</p>
          <p className="mt-3 text-sm leading-relaxed text-silver">
            The app hit a problem before this page could render. Retry the request.
            Details stay in the server log, not on this screen.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
