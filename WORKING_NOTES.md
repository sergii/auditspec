# AuditSpec v0.1 Working Notes

> Temporary planning document for the `v0.1` branch. This file is not part of the intended public release surface and should be removed before the first release squash unless its contents are promoted into stable specification or roadmap documents.

## Product direction

AuditSpec should evolve from a semantic audit-event specification into an executable assurance ecosystem without turning the core schema into a monolith.

The long-term layers are:

1. **AuditSpec Core** - vendor-neutral semantics for auditable actions.
2. **Profiles** - authorization, agents, impersonation, privacy, provenance, integrity, HTTP/runtime contexts.
3. **Conformance** - syntax, semantic, behavioral, round-trip, interoperability, fuzz/property/mutation suites.
4. **Mappings** - CloudEvents, OpenTelemetry, W3C PROV, OCSF, ECS, OSCAL.
5. **Adapters** - Rails, Frappe, Django, Hono, Next.js, NestJS, databases, MCP, CI and runtime evidence sources.
6. **Inspector** - static/runtime system assessment that discovers auditable boundaries and gaps.
7. **MCP server** - agent-facing inspection, assessment, remediation planning and verification tools.
8. **GitHub Action / GitHub App** - non-blocking PR assurance checks, inline warnings, baselines and regression ratchets.
9. **Assurance Graph** - findings, evidence, causality, coverage and confidence.
10. **Compliance** - OSCAL-backed mappings to SOC 2, ISO 27001, NIST and related control frameworks without claiming certification.
11. **Runtime Evidence** - OpenTelemetry, OS telemetry and later eBPF-backed corroboration.
12. **AuditSpec Cloud** - optional history, organization-wide trends, continuous assurance and compliance evidence.

## Core semantic completeness goals

Before stabilizing `v0.1`, complete these semantics:

- Separate **authorization decision** from **execution result**. An action can be allowed and still fail during execution.
- Replace one `target` with `targets[]`, including optional target roles.
- Generalize `affected_user` into `subjects[]`.
- Model delegation as a chain and distinguish delegation, impersonation and related relationships without rewriting the immediate actor.
- Add stable `source` and structured `producer` identity.
- Standardize useful `origin` fields instead of leaving origin entirely opaque.
- Extend correlation with `span_id`, `interaction_id`, `turn_id`, `causation_id` and `parent_event_id`.
- Make `evidence` a collection so independent authoritative, attributed, self-reported and derived evidence can coexist.
- Define action schema/version identity.
- Define ordering scope rather than implying a global sequence.
- Define event idempotency and duplicate semantics.
- Define an extension/profile mechanism that keeps the core small.
- Support actor/subject/target snapshots while respecting privacy and identity erasure.
- Make redaction explicit and distinguish omitted/redacted/hashed/tokenized/encrypted values.
- Fix schema/reference constraints so required semantic fields are actually required.
- Require RFC 3339 timestamp validation regardless of JSON Schema validator defaults.

## Agent and MCP direction

The AuditSpec MCP server should eventually expose tools such as:

- `auditspec.inspect`
- `auditspec.assess`
- `auditspec.validate_event`
- `auditspec.validate_catalog`
- `auditspec.coverage`
- `auditspec.get_findings`
- `auditspec.explain_gap`
- `auditspec.plan_remediation`
- `auditspec.generate_patch`
- `auditspec.verify_remediation`
- `auditspec.map_controls`
- `auditspec.export_oscal`
- `auditspec.query_evidence`

Desired loop:

`DISCOVER -> ASSESS -> EXPLAIN -> REMEDIATE -> VERIFY -> CONTINUOUSLY WATCH`

The agent should be able to answer questions such as:

- Which mutation and authorization boundaries exist?
- Which are covered by semantic audit events?
- Which paths lose actor or delegation identity?
- Which audit writes are non-atomic?
- Which events lack authoritative evidence?
- Which new gaps were introduced by a pull request?
- What implementation would close a specific gap?
- Did the remediation actually close it?

## GitHub integration

Ship both:

### Open-source GitHub Action

- Runs locally on the GitHub-hosted or self-hosted runner.
- Source code does not need to leave the runner.
- Can use a self-contained binary or OCI/container action.
- Produces a canonical AuditSpec assessment report plus GitHub annotations/job summary.
- Default mode is advisory and non-blocking.

### GitHub App

- Uses Checks API for richer PR-native presentation.
- Minimal permissions: metadata/read, contents/read, pull requests/read, checks/write.
- Autofix is a separate explicit opt-in capability.

### Baseline / ratchet behavior

Do not overwhelm legacy repositories with every pre-existing problem on every PR.

Default behavior:

- Show total coverage/assurance status.
- Inline-annotate primarily **new findings introduced by the PR**.
- Highlight findings resolved by the PR.
- Preserve existing findings as baseline debt.

Suggested modes:

- `advisory` - never blocks.
- `regression` - can fail only on newly introduced configured-severity gaps.
- `enforce` - explicit policy-driven blocking.

Finding output should include stable rule ID, severity, confidence, evidence and remediation guidance.

Possible rule families:

- `AS-CORE-*`
- `AS-ACTOR-*`
- `AS-DELEGATION-*`
- `AS-AUTH-*`
- `AS-RESULT-*`
- `AS-ATOMIC-*`
- `AS-PRIVACY-*`
- `AS-AGENT-*`
- `AS-MCP-*`
- `AS-INTEGRITY-*`
- `AS-EVIDENCE-*`

## Inspector architecture

Keep GitHub-specific behavior out of the core inspector.

The inspector should have three analysis levels:

1. **Universal analysis** - manifests, schemas, OpenAPI, MCP definitions, CI, OTel, CloudEvents, database schemas and audit catalogs.
2. **Language adapters** - AST/static analysis for Ruby, Python, TypeScript/JavaScript, Go, Rust, Java, PHP, C# and others.
3. **Framework adapters** - deeper knowledge for Rails, Frappe, Django, FastAPI, Hono, Next.js, NestJS, Laravel, Spring, Phoenix and others.

Potential Tree-sitter-based parsing can provide broad language coverage while framework adapters provide semantic depth.

The canonical inspector result should be format-neutral and reusable by GitHub, GitLab, CLI, MCP, IDEs and AuditSpec Cloud. SARIF can be an adapter, not the canonical format.

## Developer tooling

Potential `auditspec.yaml`:

```yaml
auditspec: "0.1"
namespace: com.example.erp
mode: advisory
profiles:
  - core
  - authorization
  - agent
frameworks:
  - rails
baseline:
  ref: main
annotations:
  new_findings_only: true
```

Potential CLI:

```text
auditspec init
auditspec lint
auditspec validate event.json
auditspec test
auditspec inspect .
auditspec assess .
auditspec fix AS-AUTH-001
auditspec generate typescript
auditspec generate ruby
```

## Conformance and testing

Target a large shared corpus rather than shallow per-language SDK tests.

### Conformance categories

- syntax
- semantics
- delegation
- impersonation
- authorization
- execution results
- snapshots
- redaction
- ordering
- idempotency and duplicates
- timestamps
- targets and subjects
- agent lifecycle
- extensions/profiles
- CloudEvents
- OpenTelemetry
- W3C PROV
- integrity

Every implementation should pass the same fixtures and normalize equivalent input to the same semantic representation.

### Property tests

Examples:

- parse -> serialize -> parse preserves semantic identity.
- normalization is idempotent.
- mapping round trips preserve defined fields.
- redaction never leaks configured secret classes.

Potential tools: fast-check, Hypothesis, proptest, Go fuzzing, Ruby generators.

### Mutation testing

Potential tools: Stryker, mutmut, cargo-mutants, mutant, gremlins.

Use mutation testing mainly for validators, adapters, normalization, redaction and behavior, not as a substitute for schema conformance.

### Fuzzing

Cover malformed JSON, invalid dates, huge/deep metadata, unusual Unicode, duplicate identifiers, nulls, oversized values and adversarial payloads.

### Behavioral/failure-injection tests

Verify transactional guarantees:

- mutation + audit succeed -> commit.
- mutation succeeds but audit persistence fails -> rollback when same-store atomicity is required.
- outbox insert failure -> rollback.
- publisher crash after commit -> durable retry.
- duplicate delivery -> one logical event.

## Reference implementations and lab

Initial implementation priority:

1. TypeScript executable reference.
2. Ruby + Rails.
3. Python + Frappe.
4. Go.
5. Rust.

Keep SDKs thin: validate, normalize, redact, map, emit through storage-neutral interfaces.

Provide a Docker/Compose conformance lab that can run multiple implementations against the same corpus and later demonstrate PostgreSQL/outbox/OTel/CloudEvents integrations.

## Mappings and formal foundations

Prioritize mappings to:

- CloudEvents for transport envelopes.
- OpenTelemetry Logs/Trace Context for observability correlation.
- W3C PROV for provenance (`Agent`, `Activity`, `Entity`, `actedOnBehalfOf`).
- OCSF and Elastic ECS for security/SIEM ecosystems.
- OSCAL for machine-readable controls, assessments, findings, evidence and remediation.

Potential JSON-LD/W3C PROV mapping should make AuditSpec usable in provenance tooling.

## Integrity

Future integrity profile:

- RFC 8785 JSON Canonicalization Scheme.
- SHA-256 or stronger configured digest.
- signatures and hash-chain/transparency options.
- SCITT-compatible signed statements/receipts where appropriate.

Use the term **tamper-evident**, not tamper-proof, unless the implementation genuinely provides stronger guarantees.

## Runtime evidence and eBPF

Treat runtime/kernel telemetry as **corroborating evidence**, not as the source of business semantics.

Application-level AuditSpec says *what the action meant*. Runtime evidence can help prove that expected processes, network calls, file access or system activity occurred.

Possible evidence adapters:

- OpenTelemetry
- Linux Audit
- osquery
- Falco
- Tetragon
- Tracee
- Windows ETW
- later direct eBPF instrumentation if there is a clear reason

Desired model: multiple independent evidence producers increase confidence in an AuditSpec assertion.

## Visualization / AuditSpec Cloud

Useful visualizations:

- timeline/swimlane of actor -> agent -> MCP -> service -> DB
- causal graph
- audit coverage graph
- evidence graph
- compliance/control matrix
- remediation Gantt where temporal project planning is useful

Potential cloud product positioning:

**AuditSpec Cloud - continuous audit assurance.**

Core OSS remains useful without the cloud. Cloud can add history, trends, organization-wide coverage, assurance graphs, continuous assessment, runtime evidence and compliance workflows.

Possible product split:

- `auditspec.dev` - canonical specification/docs/project/cloud surface.
- `auditspec.sh` - CLI/developer installation surface.

## Compliance direction

AuditSpec should map evidence to control frameworks but never claim that use of AuditSpec itself makes an organization compliant.

Use OSCAL where practical rather than inventing a proprietary control-assessment representation. Potential mappings include SOC 2, ISO 27001, NIST and related control catalogs.

## Research / scientific direction

Define explicit competency questions that a conforming system should be able to answer:

- Who acted?
- What did they attempt?
- On whose behalf?
- Which resources were involved?
- Who or what was affected?
- Was the action authorized, by which policy, and why?
- Did execution succeed?
- What changed?
- Where did the request originate?
- Which software produced each piece of evidence?
- How strong is each evidence source?
- Which request/trace/session/turn/tool call caused it?
- Was sensitive information intentionally redacted?
- Can integrity/provenance be verified?

Build a reference corpus from real-world audit/event formats such as WorkOS, GitHub, CloudTrail, Kubernetes, Okta/Auth0, Google Cloud, Stripe, OpenStatus and ERP frameworks. Map each source into AuditSpec and measure information loss.

Possible future formal model with TLA+ for mutation/audit/outbox/retry invariants, especially:

`committed business mutation => durable audit record exists`

under explicitly stated system assumptions.

## Suggested implementation order

1. Stabilize AuditSpec Core semantics.
2. Expand conformance fixtures and CI.
3. Add CloudEvents, OpenTelemetry and W3C PROV mappings.
4. Build TypeScript executable reference implementation.
5. Build Ruby/Rails implementation.
6. Build Python/Frappe implementation.
7. Add Agent/MCP profile and examples.
8. Add Docker conformance lab.
9. Add Go/Rust implementations.
10. Add integrity profile.
11. Add OCSF/ECS/SIEM and OSCAL mappings.
12. Build inspector CLI and first framework scanner.
13. Add GitHub Action with non-blocking PR warnings and baseline ratchet.
14. Add AuditSpec MCP server.
15. Add GitHub App/Checks UX.
16. Explore cloud, corpus/whitepaper and formal verification.
