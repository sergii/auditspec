import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  fromOpenTelemetryLog,
  toOpenTelemetryLog,
} from "../src/opentelemetry.js";
import type { AuditEvent } from "../src/types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const event = JSON.parse(
  readFileSync(resolve(root, "conformance/valid/agent-action.json"), "utf8"),
) as AuditEvent;

test("projects an AuditSpec event into a lossless OpenTelemetry Log shape", () => {
  const log = toOpenTelemetryLog(event);

  assert.equal(log.timestamp, event.occurred_at);
  assert.equal(log.observed_timestamp, event.recorded_at);
  assert.equal(log.event_name, event.action);
  assert.equal(log.trace_id, event.correlation?.trace_id);
  assert.equal(log.span_id, event.correlation?.span_id);
  assert.equal(log.resource["auditspec.source"], event.source);
  assert.equal(log.resource["service.name"], "erp-service");
  assert.equal(log.attributes["auditspec.actor.type"], "agent");
  assert.equal(log.attributes["auditspec.result.status"], "succeeded");
  assert.equal(log.attributes["auditspec.target.id"], "INV-0042");
  assert.deepEqual(fromOpenTelemetryLog(log), event);
});

test("rejects conflicting OpenTelemetry correlation and semantic fields", () => {
  const log = toOpenTelemetryLog(event);

  assert.throws(
    () => fromOpenTelemetryLog({ ...log, event_name: "invoice.delete" }),
    /EventName does not match/,
  );
  assert.throws(
    () => fromOpenTelemetryLog({ ...log, timestamp: "2026-08-24T00:00:00Z" }),
    /Timestamp does not match/,
  );
  assert.throws(
    () => fromOpenTelemetryLog({ ...log, observed_timestamp: "2026-08-24T00:00:00Z" }),
    /ObservedTimestamp does not match/,
  );
  assert.throws(
    () => fromOpenTelemetryLog({ ...log, trace_id: "00000000000000000000000000000000" }),
    /TraceId does not match/,
  );
  assert.throws(
    () => fromOpenTelemetryLog({ ...log, span_id: "0000000000000000" }),
    /SpanId does not match/,
  );
});

test("rejects conflicting indexed AuditSpec attributes", () => {
  const log = toOpenTelemetryLog(event);

  assert.throws(
    () => fromOpenTelemetryLog({
      ...log,
      attributes: {
        ...log.attributes,
        "auditspec.result.status": "failed",
      },
    }),
    /attribute auditspec.result.status does not match/,
  );
});

test("non-AuditSpec OpenTelemetry attributes remain transport-local", () => {
  const log = toOpenTelemetryLog(event);
  const enriched = {
    ...log,
    attributes: {
      ...log.attributes,
      "http.request.method": "POST",
      "deployment.environment.name": "production",
    },
  };

  assert.deepEqual(fromOpenTelemetryLog(enriched), event);
});
