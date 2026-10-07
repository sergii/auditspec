# External implementer quickstart

This is the smallest supported journey for someone adopting AuditSpec without reading the rest of the repository first.

The goal is intentionally narrow:

```text
create one example
      ↓
validate it
      ↓
explain it
      ↓
edit it into your first real event
```

## 1. Build the reference CLI

From the repository root:

```bash
cd implementations/typescript
npm install
npm run build
cd ../..
```

The executable is then available as:

```bash
node implementations/typescript/dist/cli.js
```

For brevity, the examples below call that command `auditspec`.

## 2. Create a valid starter event

```bash
auditspec init-example audit-event.json
```

The command refuses to overwrite an existing file. Use `--force` only when replacement is intentional.

The generated event is the same contract fixture as:

`examples/external-implementer/audit-event.json`

## 3. Validate it

Machine-readable output remains the compatibility default:

```bash
auditspec validate audit-event.json
```

Result:

```json
{
  "valid": true,
  "errors": []
}
```

For a human-oriented CI/local check:

```bash
auditspec validate audit-event.json --human
```

Result:

```text
PASS audit-event.json - valid AuditSpec Core 0.1 event
```

An invalid event exits non-zero. With `--human`, validation errors are printed as concise JSON-pointer-oriented lines.

## 4. Explain the event

```bash
auditspec explain audit-event.json
```

Example:

```text
AuditSpec event
Core: 0.1
ID: aud_quickstart_001
Source: urn:example:billing-service
Actor: service:billing
Delegation: none
Action: invoice.pay
Targets: invoice:INV-0042 (primary)
Authorization: allowed
Result: succeeded
Evidence: 2 record(s) [authorization_decision, execution]
Occurred: 2026-10-07T12:00:00Z
Recorded: 2026-10-07T12:00:00.005Z
```

For tooling:

```bash
auditspec explain audit-event.json --json
```

The JSON explanation is intentionally a projection for humans/tooling. It is not a replacement for the canonical AuditSpec event.

## 5. Turn it into your event

Change, at minimum:

- `id` to your event identifier;
- `source` to your stable producer/source namespace;
- `actor` to the immediate actor;
- `action` to a namespaced business action such as `invoice.pay`;
- `targets` to the resources acted on;
- `authorization` only when you have an authorization fact to record;
- `result` to what actually happened;
- `occurred_at` and `recorded_at` to real timestamps;
- `evidence` to the actual evidence producers and trust levels available in your system.

Then rerun:

```bash
auditspec validate audit-event.json --human
auditspec explain audit-event.json
```

## What this quickstart does not do

It does not require Inspector, MCP, runtime corroboration, agent profiles, mandate research profiles, OSCAL, or any cloud service.

Those are optional capabilities around AuditSpec Core.

A first implementation only needs to understand and emit a valid Core event.
