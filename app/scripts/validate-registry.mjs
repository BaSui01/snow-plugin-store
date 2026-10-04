#!/usr/bin/env node
// snow-plugin-store 索引校验：node app/scripts/validate-registry.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const registryPath = join(scriptDir, "..", "registry.json");

const errors = [];

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isLocalizedText = (value) => {
  if (isNonEmptyString(value)) {
    return true;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    return (
      entries.length > 0 &&
      entries.every(
        ([key, item]) => key.trim().length > 0 && isNonEmptyString(item),
      )
    );
  }
  return false;
};

let raw;
try {
  raw = readFileSync(registryPath, "utf8");
} catch (error) {
  console.error(`Cannot read app/registry.json: ${error.message}`);
  process.exit(1);
}

let registry;
try {
  registry = JSON.parse(raw);
} catch (error) {
  console.error(`app/registry.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
  console.error("app/registry.json validation failed:");
  console.error("  - registry root must be a JSON object");
  process.exit(1);
}

if (typeof registry.schemaVersion !== "number" || registry.schemaVersion < 1) {
  errors.push("schemaVersion must be a number >= 1");
}
if (!Array.isArray(registry.plugins)) {
  errors.push("plugins must be an array");
}

const seenIds = new Set();
const plugins = Array.isArray(registry.plugins) ? registry.plugins : [];
for (const [index, entry] of plugins.entries()) {
  const label = `plugins[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    errors.push(`${label} must be an object`);
    continue;
  }

  const id = isNonEmptyString(entry.id) ? entry.id.trim() : "";
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,95}$/.test(id)) {
    errors.push(
      `${label}.id is missing or invalid (letters, digits, dot, dash, underscore; not starting with a dot)`,
    );
  } else if (seenIds.has(id)) {
    errors.push(`${label}.id "${id}" is duplicated`);
  } else {
    seenIds.add(id);
  }

  if (
    entry.kind !== undefined &&
    entry.kind !== "plugin" &&
    entry.kind !== "script"
  ) {
    errors.push(`${label}.kind must be "plugin" or "script"`);
  }

  if (!isLocalizedText(entry.name)) {
    errors.push(`${label}.name must be a non-empty string or a localized object`);
  }
  if (!isLocalizedText(entry.description)) {
    errors.push(
      `${label}.description must be a non-empty string or a localized object`,
    );
  }
  if (
    !isNonEmptyString(entry.repo) ||
    !/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/.test(entry.repo.trim())
  ) {
    errors.push(`${label}.repo must look like https://github.com/owner/repo`);
  }
  if (!isNonEmptyString(entry.version)) {
    errors.push(`${label}.version is required`);
  }
  if (
    !isNonEmptyString(entry.sha256) ||
    !/^[0-9a-fA-F]{64}$/.test(entry.sha256.trim())
  ) {
    errors.push(`${label}.sha256 must be a 64-character hex string`);
  }

  if (isNonEmptyString(entry.downloadUrl)) {
    if (!/^https:\/\//.test(entry.downloadUrl.trim())) {
      errors.push(`${label}.downloadUrl must use https`);
    }
  } else if (!isNonEmptyString(entry.tag) || !isNonEmptyString(entry.asset)) {
    errors.push(`${label} needs either downloadUrl, or both tag and asset`);
  }

  for (const field of ["privacy", "tags"]) {
    if (entry[field] !== undefined) {
      if (
        !Array.isArray(entry[field]) ||
        !entry[field].every(isNonEmptyString)
      ) {
        errors.push(`${label}.${field} must be an array of non-empty strings`);
      }
    }
  }

  for (const field of [
    "author",
    "homepage",
    "minAppVersion",
    "icon",
    "tag",
    "asset",
    "downloadUrl",
  ]) {
    if (entry[field] !== undefined && typeof entry[field] !== "string") {
      errors.push(`${label}.${field} must be a string`);
    }
  }
}

if (errors.length > 0) {
  console.error("app/registry.json validation failed:");
  for (const message of errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(
  `app/registry.json OK (${plugins.length} plugin${plugins.length === 1 ? "" : "s"})`,
);
