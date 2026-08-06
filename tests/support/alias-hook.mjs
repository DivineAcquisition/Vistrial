/**
 * Resolves the `@/*` path alias from tsconfig.json for Node's test runner, and
 * fills in the extension the TypeScript sources omit.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const CANDIDATES = ["", ".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const base = join(root, specifier.slice(2));

  for (const candidate of CANDIDATES) {
    const path = `${base}${candidate}`;
    if (existsSync(path)) {
      return nextResolve(pathToFileURL(path).href, context);
    }
  }

  return nextResolve(specifier, context);
}
