# Conformance

AuditSpec conformance is executable, not only descriptive.

Every implementation MUST accept all applicable files under `valid/` and reject all applicable files under `invalid/`. Canonical examples under `schema/examples/` are also validated as valid events.

The repository runner uses JSON Schema Draft 2020-12 with RFC 3339 `date-time` format checking enabled:

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

## Current vector families

Valid vectors currently exercise:

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

Invalid vectors currently exercise:

- missing required actor
- contradictory denied + succeeded semantics
- target/reference without a required type
- invalid RFC 3339 timestamp
- legacy single-object evidence shape

This is only the first corpus. The v0.1 cycle should expand into behavioral, round-trip, property, fuzz, mutation, mapping, atomicity, idempotency, and failure-injection suites shared by every language implementation.
