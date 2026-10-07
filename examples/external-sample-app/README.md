# External sample application

This directory is a deliberately small consumer of the **stable** AuditSpec TypeScript package surface.

It is not part of the AuditSpec implementation. CI copies this app to a temporary directory outside the repository, installs a packed AuditSpec package artifact, and runs it as an external consumer.

The sample imports only:

```js
from "@auditspec/reference-typescript"
```

It does not import:

```text
@auditspec/reference-typescript/experimental
dist/*
src/*
```

## Journey

The app models one successful invoice payment and emits one AuditSpec Core event.

Its complete flow is:

```text
business action
    ↓
construct AuditSpec event
    ↓
normalize
    ↓
validate before persistence
    ↓
write events/invoice-paid.json
    ↓
validate persisted event
    ↓
explain semantic fields
    ↓
run corpus conformance
```

The sample intentionally uses only stable APIs:

- `normalizeAuditEvent`;
- `validateAuditEvent`;
- `explainAuditEvent`;
- `runConformanceCorpus`;
- `formatConformanceCorpusReport`.

## Run through the repository adoption harness

From the AuditSpec repository root:

```bash
node tools/adoption/check-external-sample.mjs
```

The harness:

1. builds the TypeScript reference;
2. creates an npm tarball with `npm pack`;
3. copies this sample to an OS temporary directory outside the repository;
4. installs the tarball into that external copy;
5. verifies the sample source uses only the stable package root;
6. runs `npm run check`;
7. verifies a private/internal package subpath cannot be imported.

Expected app output includes:

```text
PASS invoice-paid.json - valid AuditSpec Core 0.1 event
ACTOR user:42
ACTION invoice.pay
AUTHORIZATION allowed
RESULT succeeded
AuditSpec conformance
Events: 1
Valid: 1
Invalid: 0
Result: PASS
```

## Why this exists

Unit tests inside the reference implementation can accidentally succeed because they can import repository-local source files.

This sample tests a stronger boundary:

```text
packed package artifact
        ↓
Node package exports
        ↓
external working directory
        ↓
consumer using only stable imports
```

That is closer to how a future npm consumer will experience AuditSpec.

The package is still `private: true` and is not published to npm. The harness uses `npm pack` only as a local release-shape simulation.
