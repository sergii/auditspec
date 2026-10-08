import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const metadata = json("release/metadata.json");
const audit = json("release/v0.3-rc-audit.json");
const releaseDoc = read("docs/release-v0.3.md");
const changelog = read("CHANGELOG.md");

if (metadata.stage !== "candidate") {
  console.log(
    `AuditSpec RC-readiness check skipped for stage: ${metadata.stage}`,
  );
  process.exit(0);
}

check(
  metadata.reference_version === audit.candidate_version,
  "RC audit candidate_version must match release metadata.",
);
check(
  metadata.target_release === audit.target_release,
  "RC audit target_release must match release metadata.",
);
check(
  metadata.latest_release_tag === audit.base_release_tag,
  "RC audit base_release_tag must match latest_release_tag.",
);
check(
  metadata.target_release_doc === "docs/release-v0.3.md",
  "v0.3 candidate metadata must point at docs/release-v0.3.md.",
);
check(
  audit.core_contract?.spec_version === metadata.core_spec_version,
  "RC audit Core spec version must match release metadata.",
);
check(
  audit.core_contract?.changed_since_base === false,
  "RC audit must not claim an unchanged Core when changed_since_base is true.",
);
check(
  Array.isArray(audit.blockers) && audit.blockers.length === 0,
  "RC audit has unresolved blockers.",
);
check(
  releaseDoc.includes("Status: release candidate"),
  "v0.3 release document must be marked release candidate.",
);
check(
  releaseDoc.includes("## Compatibility and migration"),
  "v0.3 release document must contain compatibility/migration guidance.",
);
check(
  releaseDoc.includes("breaking_for_direct_importers") === false &&
    releaseDoc.includes("deliberate compatibility break"),
  "v0.3 release document must explain the deliberate TypeScript root-import break in prose.",
);
check(
  changelog.includes("### Compatibility and migration"),
  "v0.3 changelog must contain compatibility/migration notes.",
);
check(
  changelog.includes("@auditspec/reference-typescript/experimental"),
  "v0.3 changelog must document the experimental subpath migration.",
);

for (const path of [
  "README.md",
  "docs/versioning.md",
  "implementations/typescript/README.md",
  "CHANGELOG.md",
]) {
  check(
    !read(path).includes("0.3.0-dev."),
    `${path} still contains stale v0.3 development-version wording during RC.`,
  );
}

for (const path of [
  "conformance/README.md",
  "docs/mcp.md",
  "adapters/frappe/README.md",
  "docs/architecture.md",
]) {
  check(
    !read(path).includes("v0.2 development line"),
    `${path} still contains stale v0.2 development-line wording.`,
  );
}

const coreFiles = audit.core_contract.checked_files;
for (const path of coreFiles) {
  let base;
  try {
    base = git(["show", `${audit.base_release_tag}:${path}`]);
  } catch {
    failures.push(
      `Cannot read ${path} from ${audit.base_release_tag}; checkout must include release tags/history.`,
    );
    continue;
  }

  check(
    read(path) === base,
    `Core contract file changed since ${audit.base_release_tag} without a Core version bump: ${path}`,
  );
}

try {
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", audit.audited_development_sha, "HEAD"],
    { cwd: root, stdio: "ignore" },
  );
} catch {
  failures.push(
    "RC audit development SHA is not an ancestor of the candidate HEAD.",
  );
}

const packageJson = json("implementations/typescript/package.json");
check(
  packageJson.private === true,
  "v0.3 RC must not silently turn npm publication on.",
);
check(
  Object.keys(packageJson.exports ?? {}).sort().join(",") ===
    ".,./experimental",
  "v0.3 RC package exports must remain restricted to stable root and ./experimental.",
);

if (failures.length > 0) {
  console.error("AuditSpec v0.3 RC-readiness checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AuditSpec v0.3 RC-readiness checks passed.");
console.log(`Candidate: ${metadata.reference_version}`);
console.log(`Base release: ${audit.base_release_tag}`);
console.log(`Audited development SHA: ${audit.audited_development_sha}`);
console.log(`Core files unchanged: ${coreFiles.length}`);
console.log(`Known blockers: ${audit.blockers.length}`);
