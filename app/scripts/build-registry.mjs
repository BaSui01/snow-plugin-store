#!/usr/bin/env node
// 聚合 app/plugins/*.json 生成 app/registry.json（Snow App 客户端读取的索引）：
// node app/scripts/build-registry.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readPluginEntries } from "./registry-lib.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(scriptDir, "..");
const registryPath = join(appDir, "registry.json");

const { entries, errors } = readPluginEntries(join(appDir, "plugins"));
if (errors.length > 0) {
  console.error("Cannot rebuild registry.json - fix the entry errors first:");
  for (const message of errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

entries.sort((left, right) => String(left.id).localeCompare(String(right.id)));
const registry = { schemaVersion: 1, generated: true, plugins: entries };
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
console.log(
  `app/registry.json rebuilt (${entries.length} plugin ${entries.length === 1 ? "entry" : "entries"})`,
);
