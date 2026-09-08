# Conformance

AuditSpec conformance is executable, not only descriptive.

The v0.1 repository defines multiple machine-readable contracts. Implementations should treat the JSON Schemas, canonical examples, positive vectors, negative vectors, behavioral invariants, and capability manifests as shared interoperability material rather than re-inventing local shapes.

Current machine-readable contracts include:

- Core Audit Event
- Agent Profile
- Assessment Report
- Assessment Diff
- Assurance Graph
- Assurance Graph Diff
- Remediation Plan
- Remediation Verification Result
- Control Mapping Profile
- Control Mapping Result
- Evidence Query Result
- OSCAL Export Request
- Runtime Evidence Record
- Observation Scope
- Corroboration Report
- Corroboration Diff
- Corroboration Query Result
- Framework Adapter Manifest
- Runtime Producer Manifest

## Schema conformance

Every implementation MUST accept all applicable positive vectors and reject all applicable negative vectors. Canonical examples and built-in mapping/profile examples are validated by the repository runner.

The runner uses JSON Schema Draft 2020-12 with RFC 3339 `date-time` format checking enabled:

```bash
pip install -r tools/conformance/requirements.txt
python tools/conformance/run.py
```

The same suite can run in a container:

```bash
docker build -f tools/conformance/Dockerfile -t auditspec-conformance .
docker run --rm auditspec-conformance
```

GitHub Actions runs this suite on the `v0.1` working branch and on pull requests.

## Core event vectors

Valid event vectors currently exercise:

- human actions
- delegated agent actions
- denied authorization
- authorization allowed followed by execution failure
- multi-target and affected-subject actions
- impersonation
- transitive subagent delegation
- explicit redaction
- extension and scoped ordering semantics
- multiple evidence sources

Invalid event vectors currently exercise:

- missing required actor
- contradictory denied + succeeded semantics
- target/reference without a required type
- invalid RFC 3339 timestamp
- legacy single-object evidence shape

## Negative non-Core vectors

Non-Core contracts have targeted invalid vectors under:

```text
conformance/invalid/<contract>/*.json
```

These protect against schemas becoming accidentally too permissive. Current examples include:

- invalid Assessment Report confidence values
- Assessment Diff coverage outside `[0,1]`
- invalid Assurance Graph edge confidence
- invalid framework-dispatch confidence in Graph Diff
- remediation plans whose expected fingerprint is not required to disappear
- duplicate verification fingerprints where uniqueness is required
- control mapping relations that attempt to assert `compliant` or `passed`
- unsupported evidence-query source filters
- empty OSCAL Assessment Plan references
- runtime non-observation without a target or correlation anchor
- declared Observation Scope without the required producer set
- Corroboration Report matches without a stable target
- invalid Corroboration Diff target types and Corroboration Query relations
- unsupported Agent Profile approval states

The control-mapping negative vectors intentionally protect a core product boundary: AuditSpec mappings express evidence relevance or potential gaps, not compliance certification or pass/fail verdicts.

## Differential reference conformance

TypeScript, Ruby, and Python consume the same repository-root schemas and shared valid/invalid corpus. A disagreement between reference implementations is treated as an interoperability defect rather than a language-specific interpretation.

Go and Rust references remain future work; when added, they should join the same corpus rather than define parallel truth tables.

## Assurance invariants

Schema validity is not sufficient for an Inspector. The TypeScript reference implementation also checks behavioral safety invariants documented in `docs/assurance-invariants.md`.

The current suite includes:

```text
implementations/typescript/test/assurance-invariants.test.ts
implementations/typescript/test/assurance-evaluation.test.ts
implementations/typescript/test/all-path-model.test.ts
implementations/typescript/test/depth-truncation-hardening.test.ts
```

The small-state model test exhaustively checks 584 one-to-three-entrypoint combinations of audit, transaction, and authorization evidence against an independent oracle. Deterministic randomized tests additionally cover graph/path ordering, cycles, normalization, CloudEvents round-trips, and redaction properties.

## Mutation testing

A focused StrykerJS mutation configuration targets the pure v0.1 assurance classification function:

```bash
cd implementations/typescript
npm run test:mutation
```

The current focused baseline is:

```text
100% mutation score
88 / 88 mutants killed
0 survived
```

The repository quality gate fails below 95% when the assurance evaluator, its focused tests, mutation configuration, or mutation workflow changes. The target remains 100%; the threshold exists to keep semantic weakening visible while allowing for future equivalent mutants.

## Real-world regression surface

CI also runs the Inspector against pinned public Rails and Frappe repositories. The goal is regression detection for parser/framework behavior, not a compliance or security judgment about those projects.

## Failure-injection and framework runtime conformance

v0.1 already exercises transactional/delivery behavior outside JSON Schema:

- `lab/postgres-atomicity/` verifies same-store/outbox rollback, failure injection, stable logical identity, and duplicate delivery semantics against PostgreSQL;
- `lab/rails-atomicity/` verifies the ActiveRecord transaction adapter behavior and after-commit wake-up semantics;
- `lab/frappe-bench-atomicity/` verifies pinned Frappe Bench + MariaDB request/job transaction behavior, real persistence failures, and after-commit handling.

These behavioral labs are scoped proofs for their tested environments, not production certification.

CloudEvents, OpenTelemetry, and W3C PROV mappings also have executable TypeScript round-trip/consistency tests. Generated OSCAL Assessment Results are validated in CI against the SHA-256-verified official NIST OSCAL v1.2.3 Assessment Results JSON Schema.

## Remaining conformance and hardening families

The v0.1 cycle can still deepen conformance through:

- fuzzing malformed, deeply nested, cyclic, and oversized inputs with deterministic regression capture;
- differential conformance for future Go and Rust implementations;
- additional pinned real-world framework fixture repositories;
- control-mapping validation against authoritative external catalog versions where licensing/provenance permit;
- broader failure injection across external HTTP, broker, process/worker, and alternative database boundaries;
- runtime evidence freshness/expiry, signed evidence envelopes, producer authority policy, and multi-producer reconciliation rules;
- stronger integrity/transparency profile tests without conflating them with Core event conformance.
