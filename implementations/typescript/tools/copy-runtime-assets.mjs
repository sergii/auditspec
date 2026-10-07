import {
  cpSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "../..");
const assetsRoot = resolve(packageRoot, "dist/assets");

rmSync(assetsRoot, { recursive: true, force: true });
mkdirSync(assetsRoot, { recursive: true });

cpSync(
  resolve(repoRoot, "schema"),
  resolve(assetsRoot, "schema"),
  { recursive: true },
);

cpSync(
  resolve(repoRoot, "profiles/agent"),
  resolve(assetsRoot, "profiles/agent"),
  { recursive: true },
);

process.stdout.write("Copied AuditSpec runtime schema assets.\n");
