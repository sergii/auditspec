# AuditSpec Testing Strategy

AuditSpec uses multiple independent testing layers because no single technique is sufficient to establish schema interoperability or Inspector correctness.

The goal is not to claim formal verification. The goal is to make assumptions explicit, executable, reproducible, and increasingly difficult to weaken accidentally.

## 1. Schema conformance

The Python conformance runner validates canonical examples and shared fixtures against Draft 2020-12 JSON Schemas with RFC3339 format checking enabled.

It covers:

- valid and invalid Audit Event vectors;
- Assessment Report and Assessment Diff;
- Assurance Graph and Assurance Graph Diff;
- Remediation Plan and Verification Result;
- Control Mapping Profile and Result;
- Evidence Query Result;
- OSCAL export request;
- Agent Profile.

Negative non-Core vectors are contract-specific. They target enum, range, shape, and semantic guardrails rather than relying only on empty or missing-field examples.

## 2. Differential conformance

The TypeScript reference validator executes the same Core and non-Core invalid corpus as the Python runner.

A fixture that Python rejects but TypeScript accepts, or vice versa, is an interoperability defect even when both implementations individually pass their own tests.

Future Ruby, Python package, Go, and Rust implementations should consume the same corpus rather than maintaining language-specific truth tables.

## 3. Exhaustive small-state model checking

The assurance evaluator has a deliberately small semantic state space for resolved entrypoint paths:

```text
audit evidence        yes / no
transaction evidence  yes / no
authorization evidence yes / no
```

The reference tests exhaustively enumerate combinations for one to three entrypoints and compare the evaluator with an independent oracle.

This is not full formal model checking, but it gives complete coverage over the bounded truth table where many assurance regressions occur.

## 4. Deterministic randomized properties

Property tests generate thousands of reproducible cases from deterministic seeds.

Current properties include:

- path-set evaluation matches an independent oracle;
- path ordering cannot change assurance semantics;
- randomized cyclic graphs remain bounded and duplicate-free;
- normalization is idempotent and preserves valid Audit Events;
- CloudEvents mapping round-trips generated Audit Events losslessly;
- redaction is idempotent across retries and does not retain generated secret values.

A failing seed MUST be included in the failure message so the case can be reproduced without a fuzzing service.

## 5. Assurance invariants

`docs/assurance-invariants.md` defines conservative safety properties for graph and evidence analysis.

Examples:

- adding a weaker alternate path cannot improve assurance;
- unresolved relationships cannot strengthen evidence;
- cycles terminate;
- bounded search fails to `unknown`, never optimistic `covered`;
- source ordering does not change semantic paths;
- static absence is not runtime unreachability.

These are specification-level design constraints, not merely implementation details.

## 6. Mutation testing

Stryker mutates the pure TypeScript assurance evaluator and runs a focused semantic test suite.

The first mutation baseline exposed weak tests around confidence propagation and zero-reachable-path semantics:

```text
75% mutation score
66 / 88 mutants killed
22 survived
```

After adding explicit confidence and empty-path truth tables:

```text
100% mutation score
88 / 88 mutants killed
0 survived
```

The AuditSpec repository now treats a mutation score below 95% for this evaluator as a failing quality gate when the evaluator or its focused tests change.

The 95% gate leaves room for future equivalent mutants while keeping semantic weakening visible. The current target remains 100%.

## 7. Real-world regression smoke

CI runs the Inspector against pinned public Rails and Frappe repositories.

This verifies that parser, framework, graph, report, and CLI changes still work on non-synthetic code without making compliance claims about those projects.

Exact finding counts are intentionally not snapshotted.

## 8. GitHub Action self-smoke

AuditSpec runs its own advisory Action inside CI with automatic baseline mode.

This tests the real base/head path used by downstream repositories, including Assessment Diff and topology artifacts.

## 9. Failure-injection and runtime testing - next layer

Static and schema testing cannot prove durable audit emission under infrastructure failure.

Future behavioral profiles should test scenarios such as:

```text
business mutation succeeds + audit insert fails -> rollback
business mutation succeeds + outbox insert fails -> rollback
commit succeeds + publisher crashes -> durable retry
message delivered twice -> one logical Audit Event
runtime evidence missing -> confidence decreases, not fabricated success
```

These tests belong in framework/storage integration labs rather than AuditSpec Core JSON Schema.

## 10. Future fuzz targets

Useful fuzz surfaces include:

- deeply nested metadata and extensions;
- Unicode and JSON Pointer escaping;
- malformed timestamps;
- large graph fan-out and cyclic topology;
- CloudEvents envelope/payload inconsistencies;
- redaction policies over nested arrays and objects;
- schema adapters and normalization round-trips.

Fuzzing MUST preserve deterministic regression cases for every discovered defect.
