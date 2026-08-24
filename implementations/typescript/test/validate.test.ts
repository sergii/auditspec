import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateAuditEvent } from "../src/validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function json(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as unknown;
}

function fixtures(path: string): string[] {
  return readdirSync(resolve(root, path))
    .filter((name) => name.endsWith(".json"))
    .sort();
}

for (const name of fixtures("conformance/valid")) {
  test(`accepts valid fixture ${name}`, () => {
    const result = validateAuditEvent(json(`conformance/valid/${name}`));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
}

for (const name of fixtures("conformance/invalid")) {
  test(`rejects invalid fixture ${name}`, () => {
    const result = validateAuditEvent(json(`conformance/invalid/${name}`));
    assert.equal(result.valid, false, `${name} unexpectedly validated`);
  });
}

for (const name of fixtures("schema/examples")) {
  test(`accepts canonical example ${name}`, () => {
    const result = validateAuditEvent(json(`schema/examples/${name}`));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
}
