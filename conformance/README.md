# Conformance

AuditSpec conformance is executable, not only descriptive.

The v0.1 repository defines multiple machine-readable contracts. Implementations should treat the JSON Schemas, canonical examples, positive vectors, negative vectors, and behavioral invariants as shared interoperability material rather than re-inventing local shapes.

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
- unsupported Agent Profile approval states

The control-mapping negative vectors intentionally protect a core product boundary: AuditSpec mappings express evidence relevance or potential gaps, not compliance certification or pass/fail verdicts.

## Assurance invariants

Schema validity is not sufficient for an Inspector. The TypeScript reference implementation also checks behavioral safety invariants documented in `docs/assurance-invariants.md`.

The current suite includes:

```text
implementations/typescript/test/assurance-invariants.test.ts
implementations/typescript/test/assurance-evaluation.test.ts
implementations/typescript/test/all-path-model.test.ts
implementations/typescript/test/depth-truncation-hardening.test.ts
```

The small-state model test exhaustively checks 584 one-to-three-entrypoint combinations of audit, transaction, and authorization evidence against an independent oracle.

## Mutation testing

A focused StrykerJS mutation configuration targets the pure v0.1 assurance classification function:

```bash
cd implementations/typescript
npm run test:mutation
```

The initial mutation workflow is intentionally advisory. It runs only when the assurance evaluator, its dedicated tests, mutation configuration, or mutation workflow changes, and it can also be started manually.

The repository does not invent a blocking mutation-score threshold before observing a real baseline. Once a stable score is measured, v0.1 can establish a ratchet rather than selecting an arbitrary percentage.

## Real-world regression surface

CI also runs the Inspector against pinned public Rails and Frappe repositories. The goal is regression detection for parser/framework behavior, not a compliance or security judgment about those projects.

## Future conformance families

The v0.1 cycle should continue toward:

- behavioral transaction/atomicity and failure-injection tests
- idempotency and duplicate-delivery tests
- CloudEvents/OTel/PROV round-trip tests
- property-based generation beyond the current exhaustive small-state model
- fuzzing malformed, deeply nested, and oversized inputs
- broader mutation testing after the initial evaluator baseline is understood
- differential conformance across TypeScript, Ruby, Python, Go, and Rust
- additional framework fixture repositories
- control mapping validation against authoritative external catalog versions
- generated OSCAL validation against the complete official NIST OSCAL 1.2.3 schemas
- failure-injection tests for outbox and durable audit publication patterns
