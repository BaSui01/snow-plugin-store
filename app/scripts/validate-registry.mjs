#!/usr/bin/env node
// 校验 app/plugins/ 下的全部插件条目：node app/scripts/validate-registry.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readPluginEntries } from "./registry-lib.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginsDir = join(scriptDir, "..", "plugins");

const { entries, errors } = readPluginEntries(pluginsDir);

if (errors.length > 0) {
  console.error("Plugin entry validation failed:");
  for (const message of errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(
  `app/plugins OK (${entries.length} plugin ${entries.length === 1 ? "entry" : "entries"})`,
);
