import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildAssuranceGraphWithPlugins,
  type AssuranceGraphPlugin,
} from "../src/assurance-graph.js";
import { validateAssuranceGraph } from "../src/validate.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-graph-plugin-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const absolute = join(root, path);
      await mkdir(join(absolute, ".."), { recursive: true });
      await writeFile(absolute, content);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const acmePlugin: AssuranceGraphPlugin = {
  id: "acme-demo-v0.1",
  framework: "acme",
  apply(context) {
    const target = context.indexed.find((item) => item.node.qualified_name === "AcmeWorker#run");
    if (!target) return;

    const location = { path: "config/acme.routes", line: 1, column: 1 };
    const surface = context.addSurface(
      "ruby",
      "acme",
      "acme_rpc",
      "POST /run -> AcmeWorker#run",
      location,
    );
    context.pushEdge({
      from: surface.id,
      to: target.node.id,
      kind: "framework_dispatch",
      confidence: "high",
      framework: {
        kind: "acme_rpc",
        detail: surface.surface!.detail,
        location,
      },
    });
  },
};

test("third-party graph plugins can emit schema-valid framework surfaces", async () => {
  await withRepo(
    {
      "app/acme_worker.rb": [
        "class AcmeWorker",
        "  def run",
        "    AuditSpec.emit!(action: 'acme.run')",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraphWithPlugins(root, [acmePlugin]);
      const surface = graph.nodes.find(
        (node) => node.kind === "surface" && node.framework === "acme" && node.surface?.kind === "acme_rpc",
      );
      const target = graph.nodes.find((node) => node.qualified_name === "AcmeWorker#run");

      assert.ok(surface);
      assert.ok(target);
      assert.ok(
        graph.edges.some(
          (edge) => edge.kind === "framework_dispatch" && edge.from === surface.id && edge.to === target.id,
        ),
      );
      assert.deepEqual(validateAssuranceGraph(graph), { valid: true, errors: [] });
    },
  );
});
