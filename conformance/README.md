# Conformance

AuditSpec conformance is executable, not only descriptive.

The v0.1 repository currently defines multiple machine-readable contracts. Implementations should treat the JSON Schemas and shared examples as cross-language interoperability fixtures rather than re-inventing local shapes.

Current contracts include:

- Core Audit Event
- Agent Profile
- Assessment Report
- Assessment Diff
- Remediation Plan
- Remediation Verification Result
- Control Mapping Profile
- Control Mapping Result

Every implementation MUST accept all applicable files under `valid/` and reject all applicable files under `invalid/`. Canonical examples and built-in mapping/profile examples are validated by the repository runner.

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

## Executable assurance contracts

The runner also validates canonical examples for:

- framework-neutral repository assessment
- stable finding diff/ratchet semantics
- structured remediation planning
- evidence-scoped remediation verification
- AI agent profile data
- versioned external control mappings

This matters because the Inspector/MCP/GitHub surfaces must not quietly diverge from one another or from future Ruby/Python/Go implementations.

## Next conformance families

The current suite is only the first layer. The v0.1 cycle should continue toward:

- behavioral transaction/atomicity tests
- idempotency and duplicate delivery tests
- CloudEvents/OTel/PROV round-trip tests
- property-based generation
- fuzzing malformed/deep/large inputs
- mutation testing of validators and adapters
- differential conformance across TypeScript, Ruby, Python, Go, and Rust
- framework fixture repositories for Rails, Frappe, Django, Hono, and others
- control mapping profile validation against authoritative external catalog versions
- OSCAL export validation against official NIST schemas once export is implemented
- failure-injection tests for outbox and durable audit publication patterns
