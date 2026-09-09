import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function assertFrameworkNeutral(path: string): void {
  const content = source(path);
  assert.doesNotMatch(content, /\b(?:rails|frappe)\b/i);
  assert.doesNotMatch(content, /(?:^|\/)plugins\//);
}

test("Inspector core remains framework-neutral", () => {
  assertFrameworkNeutral("../src/inspector/core.ts");
});

test("Assurance Graph core remains framework-neutral", () => {
  assertFrameworkNeutral("../src/inspector/assurance-graph/core.ts");
});

test("Assurance Graph schema does not enumerate framework vendors", () => {
  const schema = source("../../../schema/assurance-graph.schema.json");
  assert.doesNotMatch(schema, /\"framework\"\s*:\s*\{\s*\"enum\"/);
  assert.doesNotMatch(schema, /\"rails\"\s*,\s*\"frappe\"/);
});
