import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const corpus = json("examples/implementer-feedback/corpus.json");
const issueForm = read(".github/ISSUE_TEMPLATE/implementer-feedback.yml");
const intake = read("docs/implementer-feedback-intake.md");

for (const scenario of corpus.scenarios) {
  const needle = `        - ${scenario.id}\n`;
  const count = issueForm.split(needle).length - 1;
  check(
    count === 1,
    `Issue form must list scenario ${scenario.id} exactly once; found ${count}.`,
  );
}

check(
  issueForm.includes("        - new / not listed\n"),
  'Issue form must preserve the "new / not listed" escape hatch.',
);

for (const id of [
  "scenario",
  "version",
  "context",
  "situation",
  "confusion",
  "attempted_event",
  "expected_or_resolution",
  "impact",
  "safety",
]) {
  check(
    issueForm.includes(`    id: ${id}\n`),
    `Issue form is missing intake field id: ${id}.`,
  );
}

for (const phrase of [
  "This issue is public.",
  "Do not include secrets",
  "not automatically",
  "Maintainers may cite this public issue",
]) {
  check(
    issueForm.includes(phrase),
    `Issue form is missing safety/curation boundary: ${phrase}`,
  );
}

const observedScenarios = corpus.scenarios.filter(
  (scenario) =>
    Array.isArray(scenario.observations) && scenario.observations.length > 0,
).length;

const expectedStatus =
  observedScenarios === 0
    ? "hypothesis"
    : observedScenarios === corpus.scenarios.length
      ? "observed"
      : "mixed";

check(
  corpus.evidence_status === expectedStatus,
  `Corpus evidence_status must be ${expectedStatus} for ${observedScenarios}/${corpus.scenarios.length} observed scenarios; got ${corpus.evidence_status}.`,
);

for (const scenario of corpus.scenarios) {
  for (const observation of scenario.observations ?? []) {
    check(
      observation.sanitized === true,
      `${scenario.id}/${observation.id ?? "unknown"} observation must be sanitized=true.`,
    );
    check(
      typeof observation.source_ref === "string" &&
        observation.source_ref.length > 0,
      `${scenario.id}/${observation.id ?? "unknown"} observation needs a source_ref.`,
    );
  }
}

for (const phrase of [
  "does **not** automatically change the corpus",
  "sanitize and minimize",
  "One observed scenario does not make every predicted scenario observed.",
  "Raw customer payloads, secrets, personal data",
  "Core shape, only when the semantic model itself is wrong",
]) {
  check(
    intake.includes(phrase),
    `Feedback intake document is missing curation guardrail: ${phrase}`,
  );
}

if (failures.length > 0) {
  console.error("AuditSpec implementer feedback-intake checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AuditSpec implementer feedback-intake checks passed.");
console.log(`Scenarios: ${corpus.scenarios.length}`);
console.log(`Observed scenarios: ${observedScenarios}`);
console.log(`Corpus evidence_status: ${corpus.evidence_status}`);
