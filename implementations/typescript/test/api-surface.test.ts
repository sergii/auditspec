import assert from "node:assert/strict";
import test from "node:test";
import * as stable from "../src/index.js";
import * as experimental from "../src/experimental.js";

test("stable root contains adoption APIs but not Inspector or mandate research", () => {
  assert.equal(typeof stable.validateAuditEvent, "function");
  assert.equal(typeof stable.runConformanceCorpus, "function");
  assert.equal(typeof stable.toCloudEvent, "function");

  assert.equal("inspectRepository" in stable, false);
  assert.equal("buildAssuranceGraph" in stable, false);
  assert.equal("evaluateHumanMandate" in stable, false);
  assert.equal("mapRfc8693Claims" in stable, false);
  assert.equal("createAuditSpecMcpServer" in stable, false);
});

test("experimental entrypoint exposes non-Core executable surfaces explicitly", () => {
  assert.equal(typeof experimental.inspectRepository, "function");
  assert.equal(typeof experimental.buildAssuranceGraph, "function");
  assert.equal(typeof experimental.evaluateHumanMandate, "function");
  assert.equal(typeof experimental.mapRfc8693Claims, "function");
  assert.equal(typeof experimental.createAuditSpecMcpServer, "function");
});

test("internal framework helpers are not leaked from either package entrypoint", () => {
  for (const name of [
    "scanRailsRoutes",
    "scanFrappeWhitelist",
    "inspectFrappeRepository",
  ]) {
    assert.equal(name in stable, false, `${name} leaked into stable root`);
    assert.equal(name in experimental, false, `${name} leaked into experimental root`);
  }
});
