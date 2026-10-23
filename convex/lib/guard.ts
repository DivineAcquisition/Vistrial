const RAW = new Set(["query", "mutation", "action"]);

export type GuardFile = { path: string; source: string };

export function guardViolations(files: GuardFile[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    if (file.path.endsWith(".test.ts")) continue;
    if (file.path.includes("/_generated/")) continue;
    if (file.path.endsWith("convex/lib/builders.ts") || file.path.endsWith("lib/builders.ts")) continue;
    const imports = file.source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']*_generated\/server["']/g);
    for (const match of imports) {
      const specifiers = match[1].split(",");
      for (const specifier of specifiers) {
        const imported = specifier.split(/\s+as\s+/)[0]?.trim();
        if (imported && RAW.has(imported)) {
          violations.push(`${file.path} imports ${imported} from the generated server`);
        }
      }
    }
    const exports = file.source.matchAll(/export\s+const\s+\w+\s*=\s*(query|mutation|action)\s*\(/g);
    for (const match of exports) {
      violations.push(`${file.path} exports a plain ${match[1]}`);
    }
  }
  return violations;
}
