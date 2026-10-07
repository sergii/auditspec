import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  execFileSync,
  spawnSync,
} from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const referenceRoot = resolve(repoRoot, "implementations/typescript");
const sampleRoot = resolve(repoRoot, "examples/external-sample-app");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: process.env,
  });
}

function listFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listFiles(path));
    } else if (stat.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function assertStableOnlySource(directory) {
  const sourceFiles = listFiles(directory).filter((path) =>
    path.endsWith(".mjs"),
  );

  const forbidden = [];
  for (const path of sourceFiles) {
    const source = readFileSync(path, "utf8");

    for (const match of source.matchAll(
      /["'](@auditspec\/reference-typescript[^"']*)["']/g,
    )) {
      const specifier = match[1];
      if (specifier !== "@auditspec/reference-typescript") {
        forbidden.push(`${basename(path)} -> ${specifier}`);
      }
    }

    if (/["'][^"']*(?:\/src\/|\/dist\/)[^"']*["']/.test(source)) {
      forbidden.push(`${basename(path)} -> repository/build subpath import`);
    }
  }

  if (forbidden.length > 0) {
    throw new Error(
      `External sample app must use only the stable package root:\n${forbidden
        .map((item) => `- ${item}`)
        .join("\n")}`,
    );
  }
}

assertStableOnlySource(resolve(sampleRoot, "src"));

const workspace = mkdtempSync(
  join(tmpdir(), "auditspec-external-consumer-"),
);
const packDir = resolve(workspace, "package");
const externalApp = resolve(workspace, "consumer");

try {
  run("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: referenceRoot,
  });
  mkdirSync(packDir, { recursive: true });

  const packedName = run(
    "npm",
    ["pack", "--silent", "--pack-destination", packDir],
    {
      cwd: referenceRoot,
      capture: true,
    },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);

  if (!packedName) {
    throw new Error("npm pack did not return a package filename.");
  }

  const tarball = resolve(packDir, packedName);
  cpSync(sampleRoot, externalApp, { recursive: true });

  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--no-save",
      tarball,
    ],
    { cwd: externalApp },
  );

  run("npm", ["run", "check"], { cwd: externalApp });

  const internalImport = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('@auditspec/reference-typescript/dist/inspector.js')",
    ],
    {
      cwd: externalApp,
      encoding: "utf8",
      env: process.env,
    },
  );

  if (internalImport.status === 0) {
    throw new Error(
      "Packed package unexpectedly allowed an internal dist/* subpath import.",
    );
  }

  const internalError = `${internalImport.stderr ?? ""}${internalImport.stdout ?? ""}`;
  if (!internalError.includes("ERR_PACKAGE_PATH_NOT_EXPORTED")) {
    throw new Error(
      `Internal subpath import failed for an unexpected reason:\n${internalError}`,
    );
  }

  run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      [
        "const stable = await import('@auditspec/reference-typescript');",
        "if (typeof stable.validateAuditEvent !== 'function') process.exit(1);",
        "if ('inspectRepository' in stable) process.exit(2);",
      ].join(""),
    ],
    { cwd: externalApp },
  );

  process.stdout.write(
    [
      "AuditSpec external sample app passed.",
      `Packed artifact: ${packedName}`,
      "Stable root import: PASS",
      "Stable-only source policy: PASS",
      "Internal subpath blocking: PASS",
      "",
    ].join("\n"),
  );
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
