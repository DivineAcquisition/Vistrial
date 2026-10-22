"use client";

/**
 * Runs once while the HTML is parsed. In the browser React renders it inert, so
 * it never runs twice and React does not warn about a script in a component.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
