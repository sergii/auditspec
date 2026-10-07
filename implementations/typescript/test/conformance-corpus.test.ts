import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  formatConformanceCorpusReport,
  runConformanceCorpus,
} from "../src/conformance-corpus.js";
import { QUICKSTART_EVENT } from "../src/quickstart.js";
import { validateConformanceCorpusReport } from "../src/validate.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("corpus runner recursively validates JSON events with deterministic relative paths", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-corpus-"));
  try {
    mkdirSync(join(root, "nested"), { recursive: true });
    writeJson(join(root, "z-valid.json"), QUICKSTART_EVENT);
    writeJson(join(root, "nested", "a-valid.json"), {
      ...QUICKSTART_EVENT,
      id: "aud_quickstart_002",
    });
    writeFileSync(join(root, "README.txt"), "ignored\n", "utf8");

    const report = runConformanceCorpus(root);

    assert.equal(report.passed, true);
    assert.deepEqual(report.summary, {
      total: 2,
      valid: 2,
      invalid: 0,
      parse_errors: 0,
    });
    assert.deepEqual(
      report.files.map((item) => item.path),
      ["nested/a-valid.json", "z-valid.json"],
    );
    assert.ok(report.files.every((item) => item.valid));
    assert.equal(validateConformanceCorpusReport(report).valid, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corpus runner reports schema-invalid and malformed JSON separately", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-corpus-invalid-"));
  try {
    const invalidEvent = structuredClone(QUICKSTART_EVENT) as Record<string, unknown>;
    delete invalidEvent.actor;

    writeJson(join(root, "schema-invalid.json"), invalidEvent);
    writeFileSync(join(root, "syntax-invalid.json"), "{ nope", "utf8");
    writeJson(join(root, "valid.json"), QUICKSTART_EVENT);

    const report = runConformanceCorpus(root);

    assert.equal(report.passed, false);
    assert.deepEqual(report.summary, {
      total: 3,
      valid: 1,
      invalid: 2,
      parse_errors: 1,
    });

    const schemaInvalid = report.files.find(
      (item) => item.path === "schema-invalid.json",
    );
    assert.ok(schemaInvalid);
    assert.equal(schemaInvalid.valid, false);
    assert.equal(schemaInvalid.parse_error, undefined);
    assert.ok(schemaInvalid.errors.some((error) => error.keyword === "required"));

    const syntaxInvalid = report.files.find(
      (item) => item.path === "syntax-invalid.json",
    );
    assert.deepEqual(syntaxInvalid, {
      path: "syntax-invalid.json",
      valid: false,
      errors: [],
      parse_error: "invalid_json",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corpus runner accepts one explicit JSON event file", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-corpus-single-"));
  const path = join(root, "one.json");

  try {
    writeJson(path, QUICKSTART_EVENT);
    const report = runConformanceCorpus(path);

    assert.equal(report.passed, true);
    assert.equal(report.summary.total, 1);
    assert.equal(report.files[0]?.path, "one.json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("empty corpus fails instead of reporting vacuous conformance", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-corpus-empty-"));
  try {
    writeFileSync(join(root, "README.md"), "no events\n", "utf8");

    const report = runConformanceCorpus(root);

    assert.equal(report.passed, false);
    assert.deepEqual(report.summary, {
      total: 0,
      valid: 0,
      invalid: 0,
      parse_errors: 0,
    });
    assert.match(
      formatConformanceCorpusReport(report, "events"),
      /FAIL corpus contains no JSON event files/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("human corpus report prints only failing files after the summary", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-corpus-human-"));
  try {
    const invalidEvent = structuredClone(QUICKSTART_EVENT) as Record<string, unknown>;
    delete invalidEvent.actor;
    writeJson(join(root, "invalid.json"), invalidEvent);
    writeJson(join(root, "valid.json"), QUICKSTART_EVENT);

    const report = runConformanceCorpus(root);
    const text = formatConformanceCorpusReport(report, "./events");

    assert.match(text, /^AuditSpec conformance\nCore: 0\.1/m);
    assert.match(text, /Corpus: \.\/events/);
    assert.match(text, /Events: 2/);
    assert.match(text, /Valid: 1/);
    assert.match(text, /Invalid: 1/);
    assert.match(text, /Result: FAIL/);
    assert.match(text, /FAIL invalid\.json/);
    assert.doesNotMatch(text, /PASS valid\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
