import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectRepositoryWithPlugins } from "../src/inspector/core.js";
import type { InspectorFrameworkPlugin } from "../src/inspector/plugin.js";

const demoPlugin: InspectorFrameworkPlugin = {
  id: "demo-framework-v1",
  framework: "demo",
  confidence: "certain",
  async inspect() {
    return {
      detected: true,
      evidence: ["demo marker"],
      boundaries: [],
      findings: [],
      ast_failures: 2,
    };
  },
};

const absentPlugin: InspectorFrameworkPlugin = {
  id: "absent-framework-v1",
  framework: "absent",
  async inspect() {
    return {
      detected: false,
      evidence: [],
      boundaries: [],
      findings: [],
      ast_failures: 0,
    };
  },
};

test("Inspector core composes arbitrary framework plugins without built-in framework knowledge", async () => {
  const root = await mkdtemp(join(tmpdir(), "auditspec-plugin-core-"));
  try {
    const report = await inspectRepositoryWithPlugins(root, [demoPlugin, absentPlugin]);

    assert.deepEqual(report.frameworks, [
      { name: "demo", confidence: "certain", evidence: ["demo marker"] },
    ]);
    assert.deepEqual(report.inspector.adapters, ["demo-framework-v1"]);
    assert.equal(report.metadata?.ast_parse_failures, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
