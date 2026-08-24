# Assurance Invariants

AuditSpec Inspector is intentionally conservative. These invariants define the safety properties that future discovery adapters, graph resolvers, runtime evidence sources, and policy layers must preserve.

They are not claims of formal verification. They are executable design constraints backed by regression tests in the reference implementation.

## 1. Weaker-path monotonicity

Adding a newly resolved execution path with weaker assurance evidence MUST NOT improve the assessment of an existing mutation boundary.

Example:

```text
authorized + audited route -----> mutation
new unaudited route ------------> same mutation
```

The second route can keep or reduce assurance. It cannot make the mutation appear more covered.

For v0.1 this is enforced by all-path evaluation rather than selecting only the strongest resolved path.

## 2. Unresolved relationships do not strengthen evidence

An ambiguous or unresolved call MUST NOT contribute `entrypoint`, `authorization`, `transaction`, `mutation`, or `audit` evidence to a path.

AuditSpec prefers an unresolved relationship over a speculative edge. A future adapter may resolve the relationship with stronger evidence, but uncertainty itself cannot be converted into coverage.

## 3. Cycles must terminate

Recursive calls and cyclic graph structures MUST terminate traversal without inventing duplicate paths.

A node already present in the active path is not traversed again for that path. This prevents recursion from becoming either an infinite search or artificial evidence amplification.

## 4. Bounded search fails safely

Path enumeration is intentionally bounded. v0.1 uses a maximum path count and depth to avoid combinatorial graph explosion.

If the search is incomplete because either bound is reached:

- the path set is marked `truncated`;
- the corresponding boundary MUST NOT be upgraded to `covered` from incomplete evidence;
- the canonical Inspector degrades audit status to `unknown` and confidence to `low`.

Incomplete search is uncertainty, not success.

## 5. Depth limits are explicit incompleteness

Reaching the maximum traversal depth before a known entrypoint is found MUST be treated as truncated evidence.

A depth cap is an implementation bound, not evidence that no earlier caller or entrypoint exists.

## 6. Ordering does not change semantics

Reordering graph nodes or edges MUST NOT change the semantic set of resolved assurance paths.

Stable analysis must depend on graph relationships and semantic identities rather than discovery order.

## 7. Static absence is not runtime unreachability

Failure to resolve a static path MUST produce `unknown` reachability rather than `unreachable`.

AuditSpec does not infer runtime impossibility from incomplete static evidence. Runtime traces or other evidence producers may later corroborate or contradict the static graph.

## 8. Stable semantic identity should survive source movement

Where a contract defines semantic fingerprints, moving a source construct without changing its semantic identity SHOULD NOT create artificial new/deleted findings or topology objects.

Line and column numbers remain provenance and presentation data, not primary semantic identity.

## 9. Evidence cannot silently become stronger

Combining evidence sources MUST preserve provenance and confidence. A lower-confidence or partial producer MUST NOT silently upgrade another producer to stronger certainty without an explicit reconciliation rule.

This applies to future OpenTelemetry, eBPF, framework metadata, runtime instrumentation, and remote evidence sources as well as static source analysis.

## Executable regression surface

The TypeScript reference implementation currently tests these invariants in:

```text
implementations/typescript/test/assurance-invariants.test.ts
```

The suite covers weaker alternate paths, unresolved edges, cycles, path-count truncation, depth truncation, and graph-order determinism.

These tests are intended to grow alongside the Inspector. A new adapter that violates an invariant should change the invariant only through an explicit specification decision, not by weakening a test to make CI pass.
