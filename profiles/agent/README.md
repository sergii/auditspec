# AuditSpec Agent Profile v0.1

The Agent Profile standardizes audit context that is specific to AI/coding agents without expanding AuditSpec Core for every agent runtime.

Core still owns:

- immediate `actor`
- delegation chain
- semantic `action`
- targets and subjects
- authorization and execution result
- correlation identifiers such as `session_id`, `turn_id`, and `tool_call_id`
- evidence and evidence trust

Agent-specific data SHOULD live under the namespaced extension `dev.auditspec.agent`.

## Recommended extension shape

```json
{
  "extensions": {
    "dev.auditspec.agent": {
      "schema": "https://auditspec.dev/profiles/agent/0.1",
      "data": {
        "provider": "example-provider",
        "model": "example-model",
        "runtime": {
          "name": "example-agent-runtime",
          "version": "1.2.3"
        },
        "tool": {
          "name": "update_file",
          "kind": "write"
        },
        "approval": {
          "required": true,
          "status": "approved",
          "principal": {
            "type": "user",
            "id": "usr_42"
          }
        },
        "prompt": {
          "digest": {
            "algorithm": "sha256",
            "value": "..."
          },
          "preview": "Update the invoice..."
        },
        "input": {
          "digest": {
            "algorithm": "sha256",
            "value": "..."
          }
        },
        "output": {
          "digest": {
            "algorithm": "sha256",
            "value": "..."
          }
        }
      }
    }
  }
}
```

## Lifecycle actions

Implementations MAY use semantic actions such as:

- `agent.session.start`
- `agent.session.end`
- `agent.prompt.submit`
- `agent.turn.complete`
- `agent.tool.call`
- `agent.tool.result`
- `agent.approval.request`
- `agent.approval.resolve`
- `agent.subagent.spawn`

These are suggested action names, not a requirement to log every internal agent event. Audit only events that are useful for accountability, security, product history, or evidence.

## Prompt and tool payloads

Raw prompts, tool inputs, and outputs SHOULD NOT be persisted by default in audit events. They may contain secrets, source code, personal data, or large payloads.

Prefer:

- cryptographic digests for correlation/integrity
- short policy-controlled previews when human readability is needed
- external evidence references when full payload retention is required elsewhere

## Evidence

An agent's own report of a tool call is normally `self_reported`. The service that actually authorizes or executes the tool operation may produce `authoritative` evidence for that operation.

Both may be attached to the same AuditSpec event or correlated across related events.

## Subagents

Do not collapse subagents into the root user or parent agent. Preserve the immediate subagent as `actor` and express the responsibility chain through Core `delegation` entries.
