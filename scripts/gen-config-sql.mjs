// Print the generated configuration block for the config-registry markers of a migration.
//   node scripts/gen-config-sql.mjs > /tmp/config-block.sql
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { generateConfigSql } = await jiti.import(path.join(root, "src/lib/config/sql.ts"));
process.stdout.write(`${generateConfigSql()}\n`);
