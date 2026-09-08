#!/usr/bin/env node

import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const [schemaPath, documentPath] = process.argv.slice(2);
if (!schemaPath || !documentPath) {
  process.stderr.write("usage: validate-oscal-official.mjs <official-schema.json> <assessment-results.json>\n");
  process.exit(2);
}

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const document = JSON.parse(readFileSync(documentPath, "utf8"));

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  unicodeRegExp: true,
});
addFormats(ajv);

const validate = ajv.compile(schema);
if (validate(document)) {
  process.stdout.write(`OSCAL valid: ${documentPath} against ${schemaPath}\n`);
  process.exit(0);
}

for (const error of validate.errors ?? []) {
  const path = error.instancePath || "<root>";
  process.stderr.write(`OSCAL INVALID ${path}: ${error.message ?? "validation error"}\n`);
}
process.exit(1);
