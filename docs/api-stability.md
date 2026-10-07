# TypeScript API stability

AuditSpec classifies the TypeScript reference surface before any npm publication.

The machine-readable source of truth is:

`implementations/typescript/api-surface.json`

The classification is enforced by:

`tools/api-surface/check.mjs`

and runs as part of `npm run check`.

## Stability classes

### Stable

The package root is the stable entrypoint:

```ts
import {
  validateAuditEvent,
  runConformanceCorpus,
  toCloudEvent,
} from "@auditspec/reference-typescript";
```

Stable means the API is intentionally supported for external implementers.

For the pre-1.0 project this is not a forever-compatibility promise. It means:

- symbols are deliberately selected rather than leaked by a barrel export;
- a breaking change must be intentional, documented, and associated with an appropriate repository/package release boundary;
- helpers from internal implementation modules must not appear here by accident.

The stable root currently focuses on:

- Core Audit Event types;
- Core validation/assertion;
- normalization and redaction;
- delivery identity/deduplication reference behavior;
- CloudEvents, OpenTelemetry log, and W3C PROV Core projections;
- first-time implementer quickstart helpers;
- implementer-owned corpus conformance.

### Experimental

Experimental APIs require an explicit subpath import:

```ts
import {
  inspectRepository,
  evaluateHumanMandate,
  mapRfc8693Claims,
} from "@auditspec/reference-typescript/experimental";
```

This surface includes executable capabilities that are useful and tested but are not yet compatibility-stable enough for the root package contract.

Examples include:

- Inspector, Assessment, Assurance Graph, remediation, and evidence-query APIs;
- runtime corroboration and runtime producer APIs;
- OSCAL/control mappings;
- MCP server construction;
- OAuth/RFC 8693, RFC 9421/DPoP evidence projections;
- assurance attenuation;
- human-mandate, mandate-proof, AAE/Intent Token, and end-to-end mandate-chain research.

Experimental APIs may change incompatibly across `0.x` releases. Their semantic guardrails still apply: experimental does not mean unsafe or untested.

### Internal

Internal modules are implementation details.

They include AST helpers, Rails/Frappe parser/resolver modules, Inspector plugin internals, CLI/server executable entrypoints, and other plumbing.

They are not package subpath exports.

Consumers MUST NOT rely on repository-relative paths such as:

```text
src/rails-routes.ts
dist/frappe-inspect.js
dist/inspector/core.js
```

A file being present in the repository or build output does not make it a supported package API.

## Package boundary

The package export map is intentionally small:

```text
@auditspec/reference-typescript
@auditspec/reference-typescript/experimental
```

There is no wildcard export for `./*`.

When this package is eventually published, Node package exports will therefore block accidental imports of internal implementation subpaths.

The package remains `private: true` until publication is explicitly approved.

## Mixed modules

Some source modules contain both stable and experimental functions.

The current example is `src/validate.ts`.

The root and experimental entrypoints use explicit named exports from mixed modules. `export *` from a mixed module is prohibited by the API-surface checker.

This allows one implementation file to share AJV setup while keeping the external stability boundary precise.

## Drift prevention

The API-surface checker fails when:

- a TypeScript source module is not classified;
- a module is classified more than once;
- the stable root uses `export *`;
- the stable root exports a symbol not listed in the manifest;
- a stable entrypoint references an experimental/internal module;
- the experimental entrypoint references an internal/stable-only module incorrectly;
- a mixed-module symbol appears in the wrong stability class;
- package exports expose anything beyond the stable root and explicit experimental entrypoint;
- package/version metadata drifts from the manifest.

Adding a new source module therefore requires an explicit choice:

```text
stable
experimental
internal
mixed
```

No classification means CI failure.

## GitHub Action and CLI

The GitHub Action is a released product surface but it internally consumes Inspector APIs through the explicit experimental library entrypoint.

That does not make the Inspector library API stable by accident.

Likewise, CLI commands are user-facing executable behavior, while `src/cli.ts` itself remains an internal implementation module.

Executable compatibility and library-import compatibility are separate contracts.

## Publication gate

Before npm publication, the project should additionally decide:

- package name/ownership and provenance;
- whether the experimental subpath ships in the first npm release;
- semver policy for stable root changes during `0.x`;
- package provenance/signing;
- generated declaration/API diff checks against the previous published version.

The current classification removes the biggest immediate risk: publishing the historical catch-all `index.ts` and accidentally making every accumulated helper a public contract.
