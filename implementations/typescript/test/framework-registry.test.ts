import assert from "node:assert/strict";
import test from "node:test";
import { getFrameworkAdapter, listFrameworkAdapters } from "../src/framework-registry.js";

test("loads schema-valid framework adapter manifests", () => {
  const manifests = listFrameworkAdapters();
  assert.deepEqual(manifests.map((manifest) => manifest.framework), ["frappe", "rails"]);
});

test("Rails exposes framework-runtime transaction proof without claiming runtime corroboration", () => {
  const rails = getFrameworkAdapter("rails");
  assert.ok(rails);
  assert.equal(rails.layers.language_reference.status, "implemented");
  assert.equal(rails.layers.transaction_adapter.status, "implemented");
  assert.equal(rails.layers.behavioral_runtime_lab.status, "implemented");
  assert.equal(rails.layers.behavioral_runtime_lab.proof, "framework_runtime");
  assert.equal(rails.layers.inspector_adapter.adapter_id, "rails-ast-assisted-v0.1");
  assert.equal(rails.layers.runtime_corroboration.status, "planned");
});

test("Frappe exposes pinned Bench framework-runtime proof without claiming runtime corroboration", () => {
  const frappe = getFrameworkAdapter("frappe");
  assert.ok(frappe);
  assert.equal(frappe.layers.transaction_adapter.status, "implemented");
  assert.equal(frappe.layers.behavioral_runtime_lab.status, "implemented");
  assert.equal(frappe.layers.behavioral_runtime_lab.proof, "framework_runtime");
  assert.equal(frappe.layers.inspector_adapter.adapter_id, "frappe-ast-assisted-v0.1");
  assert.equal(frappe.layers.runtime_corroboration.status, "planned");
});

test("unknown frameworks do not inherit capabilities", () => {
  assert.equal(getFrameworkAdapter("unknown-framework"), null);
});
