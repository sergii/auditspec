import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const packageRoot = resolve(repoRoot, "implementations/typescript");
const srcRoot = resolve(packageRoot, "src");

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function portable(path) {
  return path.split(sep).join("/");
}

function listTypeScriptFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listTypeScriptFiles(path));
    } else if (stat.isFile() && name.endsWith(".ts")) {
      files.push(portable(relative(packageRoot, path)));
    }
  }
  return files;
}

function parseExports(source) {
  const named = [];
  const stars = [];

  const namedPattern =
    /export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];/g;
  for (const match of source.matchAll(namedPattern)) {
    const sourceModule = match[2];
    const names = match[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const alias = value.split(/\s+as\s+/);
        return {
          imported: alias[0].trim(),
          exported: (alias[1] ?? alias[0]).trim(),
        };
      });
    named.push({ source: sourceModule, names });
  }

  const starPattern =
    /export\s+\*\s+from\s+["']([^"']+)["'];/g;
  for (const match of source.matchAll(starPattern)) {
    stars.push(match[1]);
  }

  return { named, stars };
}

function sourcePath(moduleSpecifier) {
  if (!moduleSpecifier.startsWith("./") || !moduleSpecifier.endsWith(".js")) {
    return null;
  }
  return `src/${moduleSpecifier.slice(2, -3)}.ts`;
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const manifest = json("implementations/typescript/api-surface.json");
const packageJson = json("implementations/typescript/package.json");

check(manifest.manifest_version === "0.1", "API surface manifest_version must be 0.1.");
check(
  manifest.package === packageJson.name,
  "API surface package name must match package.json.",
);
check(
  manifest.package_version === packageJson.version,
  "API surface package_version must match package.json.",
);
check(
  manifest.core_spec_version === "0.1",
  "API surface Core spec version must remain 0.1 unless Core is deliberately versioned.",
);

const expectedPackageExports = {
  ".": {
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  },
  "./experimental": {
    types: "./dist/experimental.d.ts",
    import: "./dist/experimental.js",
  },
};
check(
  JSON.stringify(packageJson.exports) === JSON.stringify(expectedPackageExports),
  "package.json exports must expose only the stable root and explicit ./experimental entrypoint.",
);
check(
  packageJson.private === true,
  "Reference package must remain private until publication is explicitly approved.",
);

const classified = new Map();
function classify(paths, stability) {
  for (const path of paths) {
    if (classified.has(path)) {
      failures.push(
        `Source module ${path} is classified more than once (${classified.get(path)} and ${stability}).`,
      );
    } else {
      classified.set(path, stability);
    }
  }
}

classify(manifest.stable_modules, "stable");
classify(manifest.experimental_modules, "experimental");
classify(manifest.internal_modules, "internal");
classify(Object.keys(manifest.mixed_modules), "mixed");

const sourceFiles = listTypeScriptFiles(srcRoot).filter(
  (path) => path !== "src/index.ts" && path !== "src/experimental.ts",
);

for (const path of sourceFiles) {
  check(
    classified.has(path),
    `Unclassified TypeScript source module: ${path}`,
  );
}
for (const path of classified.keys()) {
  check(
    sourceFiles.includes(path),
    `API surface manifest references missing/non-source module: ${path}`,
  );
}

const stableSource = read("implementations/typescript/src/index.ts");
const experimentalSource = read(
  "implementations/typescript/src/experimental.ts",
);
const stableExports = parseExports(stableSource);
const experimentalExports = parseExports(experimentalSource);

check(
  stableExports.stars.length === 0,
  "Stable root must use explicit named exports only; export * can accidentally widen the public contract.",
);

const stableNames = stableExports.named
  .flatMap((entry) => entry.names.map((name) => name.exported))
  .sort();
const manifestStableNames = [...manifest.entrypoints["."].exports].sort();

check(
  JSON.stringify(stableNames) === JSON.stringify(manifestStableNames),
  "Stable root exported symbols must exactly match api-surface.json entrypoints['.'].exports.",
);

function validateEntrypoint(parsed, stability) {
  const entries = [
    ...parsed.stars.map((source) => ({ source, names: null })),
    ...parsed.named,
  ];

  for (const entry of entries) {
    const path = sourcePath(entry.source);
    check(path !== null, `${stability} entrypoint uses unsupported module specifier ${entry.source}.`);
    if (!path) continue;

    const classification = classified.get(path);
    if (classification === "mixed") {
      check(
        entry.names !== null,
        `${stability} entrypoint must not export * from mixed module ${path}.`,
      );
      if (entry.names) {
        const allowed =
          stability === "stable"
            ? manifest.mixed_modules[path].stable_exports
            : manifest.mixed_modules[path].experimental_exports;
        for (const name of entry.names) {
          check(
            allowed.includes(name.imported),
            `${stability} entrypoint exports ${name.imported} from mixed module ${path}, but that symbol is not classified ${stability}.`,
          );
        }
      }
      continue;
    }

    check(
      classification === stability,
      `${stability} entrypoint references ${path}, classified as ${classification ?? "unclassified"}.`,
    );
  }
}

validateEntrypoint(stableExports, "stable");
validateEntrypoint(experimentalExports, "experimental");

for (const [path, mixed] of Object.entries(manifest.mixed_modules)) {
  const overlap = mixed.stable_exports.filter((name) =>
    mixed.experimental_exports.includes(name),
  );
  check(
    overlap.length === 0,
    `Mixed module ${path} classifies symbols twice: ${overlap.join(", ")}`,
  );
}

for (const entry of Object.values(manifest.entrypoints)) {
  check(
    existsSync(resolve(packageRoot, entry.source)),
    `Entrypoint source is missing: ${entry.source}`,
  );
}

if (failures.length > 0) {
  console.error("AuditSpec TypeScript API surface checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AuditSpec TypeScript API surface checks passed.");
console.log(`Stable symbols: ${stableNames.length}`);
console.log(`Stable modules: ${manifest.stable_modules.length}`);
console.log(`Experimental modules: ${manifest.experimental_modules.length}`);
console.log(`Internal modules: ${manifest.internal_modules.length}`);
console.log(`Mixed modules: ${Object.keys(manifest.mixed_modules).length}`);
