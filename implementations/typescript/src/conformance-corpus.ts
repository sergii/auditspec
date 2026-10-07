import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  basename,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  validateAuditEvent,
  type ValidationIssue,
} from "./validate.js";

export interface ConformanceCorpusFileResult {
  path: string;
  valid: boolean;
  errors: ValidationIssue[];
  parse_error?: "invalid_json";
}

export interface ConformanceCorpusReport {
  report_version: "0.1";
  core_spec_version: "0.1";
  passed: boolean;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    parse_errors: number;
  };
  files: ConformanceCorpusFileResult[];
}

function portablePath(path: string): string {
  return path.split(sep).join("/");
}

function compareIssues(left: ValidationIssue, right: ValidationIssue): number {
  return (
    left.instancePath.localeCompare(right.instancePath) ||
    left.schemaPath.localeCompare(right.schemaPath) ||
    left.keyword.localeCompare(right.keyword) ||
    (left.message ?? "").localeCompare(right.message ?? "")
  );
}

function discoverJsonFiles(root: string): string[] {
  const resolved = resolve(root);
  const rootStat = lstatSync(resolved);

  if (rootStat.isSymbolicLink()) {
    throw new TypeError("Conformance corpus root must not be a symbolic link.");
  }

  if (rootStat.isFile()) {
    if (extname(resolved).toLowerCase() !== ".json") {
      throw new TypeError("Conformance corpus file must have a .json extension.");
    }
    return [resolved];
  }

  if (!rootStat.isDirectory()) {
    throw new TypeError("Conformance corpus path must be a JSON file or directory.");
  }

  const files: string[] = [];

  function walk(directory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
        files.push(path);
      }
    }
  }

  walk(resolved);
  return files;
}

function fileLabel(root: string, file: string): string {
  const resolvedRoot = resolve(root);
  const stat = lstatSync(resolvedRoot);
  if (stat.isFile()) return basename(file);
  return portablePath(relative(resolvedRoot, file));
}

export function runConformanceCorpus(
  root: string,
): ConformanceCorpusReport {
  const files = discoverJsonFiles(root);
  const results: ConformanceCorpusFileResult[] = [];

  for (const file of files) {
    const path = fileLabel(root, file);

    let input: unknown;
    try {
      input = JSON.parse(readFileSync(file, "utf8")) as unknown;
    } catch {
      results.push({
        path,
        valid: false,
        errors: [],
        parse_error: "invalid_json",
      });
      continue;
    }

    const validation = validateAuditEvent(input);
    results.push({
      path,
      valid: validation.valid,
      errors: validation.valid
        ? []
        : [...validation.errors].sort(compareIssues),
    });
  }

  results.sort((left, right) => left.path.localeCompare(right.path));

  const valid = results.filter((result) => result.valid).length;
  const invalid = results.length - valid;
  const parseErrors = results.filter(
    (result) => result.parse_error === "invalid_json",
  ).length;

  return {
    report_version: "0.1",
    core_spec_version: "0.1",
    passed: results.length > 0 && invalid === 0,
    summary: {
      total: results.length,
      valid,
      invalid,
      parse_errors: parseErrors,
    },
    files: results,
  };
}

export function formatConformanceCorpusReport(
  report: ConformanceCorpusReport,
  corpusLabel: string,
): string {
  const lines = [
    "AuditSpec conformance",
    "Core: 0.1",
    `Corpus: ${corpusLabel}`,
    `Events: ${report.summary.total}`,
    `Valid: ${report.summary.valid}`,
    `Invalid: ${report.summary.invalid}`,
    `Parse errors: ${report.summary.parse_errors}`,
    `Result: ${report.passed ? "PASS" : "FAIL"}`,
  ];

  const failures = report.files.filter((file) => !file.valid);
  if (failures.length > 0) {
    lines.push("");
    for (const failure of failures) {
      if (failure.parse_error === "invalid_json") {
        lines.push(`FAIL ${failure.path} - invalid JSON`);
        continue;
      }

      lines.push(
        `FAIL ${failure.path} - ${failure.errors.length} validation error(s)`,
      );
      for (const error of failure.errors) {
        lines.push(
          `  ${error.instancePath || "/"}: ${error.message ?? error.keyword}`,
        );
      }
    }
  }

  if (report.summary.total === 0) {
    lines.push("", "FAIL corpus contains no JSON event files");
  }

  return `${lines.join("\n")}\n`;
}
