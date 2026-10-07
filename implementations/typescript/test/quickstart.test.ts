import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  explainAuditEvent,
  formatAuditEventExplanation,
  QUICKSTART_EVENT,
} from "../src/quickstart.js";
import { validateAuditEvent } from "../src/validate.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");

test("quickstart event is a valid AuditSpec Core event", () => {
  const result = validateAuditEvent(QUICKSTART_EVENT);
  assert.equal(result.valid, true);
});

test("checked-in external implementer example matches generated quickstart event", () => {
  const checkedIn = JSON.parse(
    readFileSync(
      resolve(repoRoot, "examples/external-implementer/audit-event.json"),
      "utf8",
    ),
  ) as unknown;

  assert.deepEqual(checkedIn, QUICKSTART_EVENT);
});

test("quickstart explanation exposes the adoption-critical semantic fields", () => {
  const explanation = explainAuditEvent(QUICKSTART_EVENT);

  assert.deepEqual(explanation, {
    core_spec_version: "0.1",
    event_id: "aud_quickstart_001",
    source: "urn:example:billing-service",
    actor: "service:billing",
    delegation: [],
    action: "invoice.pay",
    targets: ["invoice:INV-0042 (primary)"],
    authorization: "allowed",
    result: "succeeded",
    evidence: {
      count: 2,
      kinds: ["authorization_decision", "execution"],
      trust: {
        authoritative: 2,
      },
    },
    occurred_at: "2026-10-07T12:00:00Z",
    recorded_at: "2026-10-07T12:00:00.005Z",
  });
});

test("human explanation is concise and deterministic", () => {
  const text = formatAuditEventExplanation(QUICKSTART_EVENT);

  assert.match(text, /^AuditSpec event\nCore: 0\.1/m);
  assert.match(text, /Actor: service:billing/);
  assert.match(text, /Action: invoice\.pay/);
  assert.match(text, /Authorization: allowed/);
  assert.match(text, /Result: succeeded/);
  assert.match(
    text,
    /Evidence: 2 record\(s\) \[authorization_decision, execution\]/,
  );
});
