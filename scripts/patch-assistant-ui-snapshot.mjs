/**
 * assistant-ui's LazyMemoizeSubject rebuilds its state object on every read
 * until something subscribes. React then treats that as a changing snapshot
 * and Compass crashes with "Maximum update depth exceeded" while the page loads.
 *
 * Recompute only when the subject is marked dirty. The first read still
 * fills the cache; later reads return the same object until an update.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(dirname(require.resolve("@assistant-ui/core")));
const file = join(root, "dist/subscribable/subscribable.js");
const source = readFileSync(file, "utf8");
const broken = "if (!this.isConnected || this._previousStateDirty) {";
const fixed = "if (this._previousStateDirty) {";
if (source.includes(fixed) && !source.includes(broken)) {
  process.stdout.write("assistant-ui snapshot cache already patched\n");
} else if (!source.includes(broken)) {
  process.stderr.write("assistant-ui snapshot patch did not find the expected code. Compass may still fail to load.\n");
  process.exitCode = 1;
} else {
  writeFileSync(file, source.replace(broken, fixed));
  process.stdout.write("patched assistant-ui snapshot cache\n");
}
