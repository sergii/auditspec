import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateAgentProfile } from "../src/validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const profile = JSON.parse(
  readFileSync(resolve(root, "profiles/agent/examples/tool-call.json"), "utf8"),
) as unknown;

test("accepts the canonical Agent Profile example", () => {
  const result = validateAgentProfile(profile);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("rejects an approval without required status", () => {
  const result = validateAgentProfile({ approval: { required: true } });
  assert.equal(result.valid, false);
});
