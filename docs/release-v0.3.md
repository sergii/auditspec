# AuditSpec v0.3.0 release readiness

Version: v0.3.0  
Candidate: 0.3.0-rc.1  
Date: 2026-10-08  
Status: release candidate

## Release thesis

v0.3.0 is an adoption and conformance release.

It does not redefine AuditSpec Core. The normative event contract remains:

```text
spec_version: "0.1"
```

The release makes that existing Core easier to adopt, validate, explain, package, and review from the perspective of an independent implementer.

## Delta from v0.2.0

The RC audit compares `v0.2.0` with development commit `0c2783248c48bab84b096b134d842948d3fb808f`.

Snapshot:

```text
commits ahead    9
changed files    55
additions        6070
deletions        287
open issues      0
open PRs         0
```

The machine-readable audit snapshot is `release/v0.3-rc-audit.json`.

## What changed

The v0.3 line adds the external-implementer path:

```text
init-example
    -> validate
    -> explain
    -> conformance
```

It also adds:

- deterministic implementer-owned corpus validation with human and JSON reports;
- a versioned Conformance Corpus Report contract;
- stable / experimental / internal TypeScript API classification;
- a package export map with a deliberately small stable root;
- a packed-package sample application that runs outside the repository;
- packaged runtime schema assets so validation works outside the monorepo;
- a schema-valid semantic confusion corpus;
- a Core semantic decision guide;
- structured real implementer feedback intake and curated observation provenance;
- generic development/release metadata and release-boundary CI.

## Core compatibility

No Core version bump is required.

The RC gate verifies byte-for-byte equality with `v0.2.0` for:

- `SPEC.md`;
- `schema/audit-event.schema.json`;
- `spec/actors.md`;
- `spec/trust-model.md`;
- `spec/delivery.md`.

Therefore v0.3.0 does not require producers to emit a new Core `spec_version`.

## Compatibility and migration

### TypeScript root import

This is the one deliberate compatibility break in the repository-local TypeScript library surface.

v0.2.0 exposed a catch-all root barrel:

```ts
import {
  inspectRepository,
  evaluateHumanMandate,
  corroborateAssessment,
} from "@auditspec/reference-typescript";
```

v0.3.0 classifies those APIs as experimental:

```ts
import {
  inspectRepository,
  evaluateHumanMandate,
  corroborateAssessment,
} from "@auditspec/reference-typescript/experimental";
```

The stable root now contains only explicitly supported Core/adoption/interoperability APIs.

Impact is limited because the TypeScript package is still `private: true` and has not been published to npm, but repository-local or packed-artifact consumers that imported non-Core symbols from the old root must migrate.

### CLI

Existing machine-readable:

```bash
auditspec validate event.json
```

continues to return JSON and preserves exit-code behavior.

New commands/options are additive:

```bash
auditspec init-example
auditspec validate event.json --human
auditspec explain event.json
auditspec conformance ./events/
```

### GitHub Action

The action remains advisory and its user-facing inputs/outputs remain compatible.

Its internal Inspector import moved to the explicit experimental package entrypoint. That internal refactor is not an Action API change.

### Non-Core schemas

The Conformance Corpus Report and Implementer Feedback Corpus are new non-Core contracts with their own `0.1` contract versions.

They do not imply a Core event version change.

## Distribution boundary

The TypeScript reference remains private and unpublished.

v0.3.0 validates the future package shape with `npm pack`, including:

- stable root exports;
- explicit `./experimental` exports;
- blocked internal subpaths;
- packaged runtime schemas/profile assets;
- an external sample application installed in a temporary directory outside the repository.

npm publication is not a v0.3.0 release gate.

## Feedback evidence boundary

The implementer confusion corpus currently has:

```text
evidence_status = hypothesis
```

This is not a blocker.

It means the scenarios are predicted semantic failure modes, not a claim that external users have already reported every one.

The new feedback intake workflow allows real observations to be curated later without rewriting release history.

## RC go/no-go audit

The following are release-candidate gates:

- [x] no open repository issues were present at the RC audit snapshot;
- [x] no open pull requests were present at the RC audit snapshot;
- [x] Core spec_version remains 0.1;
- [x] normative Core files are unchanged from v0.2.0;
- [x] stable TypeScript root is machine-classified and CI-enforced;
- [x] root-import compatibility break is documented;
- [x] package remains private/unpublished;
- [x] packed external-consumer test passes;
- [x] implementer corpus runner has deterministic machine-readable output;
- [x] semantic confusion corpus is explicitly hypothesis evidence;
- [x] feedback intake requires sanitized curated observations;
- [x] generic release-boundary CI is active;
- [ ] 0.3.0-rc.1 branch/PR completes all required CI;
- [ ] candidate metadata is merged to main;
- [ ] optional RC tag `v0.3.0-rc.1` is created if a tagged soak is desired.

## Final v0.3.0 gates after RC

Before the final `v0.3.0` tag:

- keep the RC on main long enough to catch release-shape regressions;
- resolve any RC-blocking issue discovered during soak;
- change metadata stage from `candidate` to `released`;
- change TypeScript/MCP version from `0.3.0-rc.1` to `0.3.0`;
- date the `v0.3.0` changelog entry;
- update README/versioning from candidate wording to released wording;
- run all required CI on the final main commit;
- create immutable `v0.3.0` tag from that commit;
- verify tag-triggered CI and GitHub Action smoke.

## Known non-blocking gaps

The following are intentionally not v0.3.0 blockers:

- npm publication;
- Go/Rust reference implementations;
- converting all hypothesis feedback scenarios into observed scenarios;
- stabilizing experimental Inspector/runtime/agent/mandate APIs;
- deeper framework resolution and additional runtime producers.

## Decision

At the start of RC preparation there are no known release blockers.

The candidate should proceed as `0.3.0-rc.1`, subject to the complete PR CI suite.
