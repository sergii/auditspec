import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { validateAuditEvent } from "../src/validate.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");

interface FeedbackScenario {
  id: string;
  title: string;
  focus: string[];
  situation: string;
  misconception: string;
  why_misleading: string;
  takeaway: string;
  spec_refs: string[];
  anti_pattern_events: unknown[];
  recommended_events: unknown[];
  expected_changed_fields: string[];
}

interface FeedbackCorpus {
  corpus_version: "0.1";
  evidence_status: "hypothesis" | "observed" | "mixed";
  description: string;
  scenarios: FeedbackScenario[];
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as unknown;
}

function valueAtTopLevel(events: unknown[], field: string): unknown[] {
  return events.map((event) => {
    if (event === null || Array.isArray(event) || typeof event !== "object") {
      return undefined;
    }
    return (event as Record<string, unknown>)[field];
  });
}

test("implementer feedback corpus conforms to its machine-readable contract", () => {
  const schema = loadJson("schema/implementer-feedback-corpus.schema.json");
  const corpus = loadJson("examples/implementer-feedback/corpus.json");

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(corpus);

  assert.equal(
    valid,
    true,
    JSON.stringify(validate.errors ?? [], null, 2),
  );
});

test("corpus contains enough distinct hypothesis scenarios to exercise Core mental-model traps", () => {
  const corpus = loadJson(
    "examples/implementer-feedback/corpus.json",
  ) as FeedbackCorpus;

  assert.equal(corpus.corpus_version, "0.1");
  assert.equal(corpus.evidence_status, "hypothesis");
  assert.ok(corpus.scenarios.length >= 10);

  const ids = corpus.scenarios.map((scenario) => scenario.id);
  assert.equal(new Set(ids).size, ids.length);

  const covered = new Set(corpus.scenarios.flatMap((scenario) => scenario.focus));
  for (const required of [
    "actor",
    "delegation",
    "source",
    "producer",
    "targets",
    "subjects",
    "authorization",
    "result",
    "evidence",
    "correlation",
    "identity",
    "time",
    "delivery",
  ]) {
    assert.equal(covered.has(required), true, `missing focus area: ${required}`);
  }
});

test("every anti-pattern is intentionally Core-valid so schema validity cannot masquerade as semantic correctness", () => {
  const corpus = loadJson(
    "examples/implementer-feedback/corpus.json",
  ) as FeedbackCorpus;

  for (const scenario of corpus.scenarios) {
    for (const [index, event] of scenario.anti_pattern_events.entries()) {
      const result = validateAuditEvent(event);
      assert.equal(
        result.valid,
        true,
        `${scenario.id} anti_pattern_events[${index}] should remain Core-valid: ${JSON.stringify(result.errors)}`,
      );
    }

    for (const [index, event] of scenario.recommended_events.entries()) {
      const result = validateAuditEvent(event);
      assert.equal(
        result.valid,
        true,
        `${scenario.id} recommended_events[${index}] should be Core-valid: ${JSON.stringify(result.errors)}`,
      );
    }
  }
});

test("each scenario actually changes every field it claims to teach", () => {
  const corpus = loadJson(
    "examples/implementer-feedback/corpus.json",
  ) as FeedbackCorpus;

  for (const scenario of corpus.scenarios) {
    for (const field of scenario.expected_changed_fields) {
      const anti = valueAtTopLevel(scenario.anti_pattern_events, field);
      const recommended = valueAtTopLevel(scenario.recommended_events, field);

      assert.notDeepEqual(
        anti,
        recommended,
        `${scenario.id} claims ${field} changes but the examples are identical`,
      );
    }
  }
});

test("single-event alternatives keep logical identity stable unless identity itself is the lesson", () => {
  const corpus = loadJson(
    "examples/implementer-feedback/corpus.json",
  ) as FeedbackCorpus;

  for (const scenario of corpus.scenarios) {
    if (scenario.focus.includes("identity")) continue;
    if (
      scenario.anti_pattern_events.length !== 1 ||
      scenario.recommended_events.length !== 1
    ) {
      continue;
    }

    const anti = scenario.anti_pattern_events[0] as {
      source?: string;
      id?: string;
    };
    const recommended = scenario.recommended_events[0] as {
      source?: string;
      id?: string;
    };

    assert.equal(
      anti.id,
      recommended.id,
      `${scenario.id} should not teach an unrelated id change`,
    );

    if (!scenario.focus.includes("source")) {
      assert.equal(
        anti.source,
        recommended.source,
        `${scenario.id} should not teach an unrelated source change`,
      );
    }
  }
});

test("scenario references point at existing specification documents", () => {
  const corpus = loadJson(
    "examples/implementer-feedback/corpus.json",
  ) as FeedbackCorpus;

  for (const scenario of corpus.scenarios) {
    for (const ref of scenario.spec_refs) {
      const [path, anchor] = ref.split("#", 2);
      assert.ok(path);
      assert.ok(anchor);
      const source = readFileSync(resolve(repoRoot, path), "utf8");
      assert.ok(source.length > 0, `${scenario.id}: missing source ${path}`);
    }
  }
});
