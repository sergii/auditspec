# AuditSpec Agent Profile v0.1

The Agent Profile standardizes audit context specific to AI and coding agents without expanding AuditSpec Core for every agent runtime.

The machine-readable profile schema is `agent-profile.schema.json`. Agent-specific data SHOULD live under the namespaced Core extension `dev.auditspec.agent` and use the immutable schema URI `https://auditspec.dev/profiles/agent/0.1/schema.json`.

Core still owns:

- immediate `actor`
- delegation chain
- semantic `action`
- targets and subjects
- authorization and execution result
- `session_id`, `turn_id`, and `tool_call_id` correlation
- evidence and evidence trust

The profile adds:

- provider, model, and agent version
- agent runtime identity
- parent-agent identity when useful in addition to Core delegation
- tool identity and MCP/server context
- approval state and approving principal
- prompt/input/output digests and policy-controlled previews
- optional token counts

## Example extension

```json
{
  "extensions": {
    "dev.auditspec.agent": {
      "schema": "https://auditspec.dev/profiles/agent/0.1/schema.json",
      "data": {
        "provider": "example-provider",
        "model": "example-model",
        "runtime": {
          "name": "example-agent-runtime",
          "version": "1.2.3"
        },
        "tool": {
          "name": "update_file",
          "kind": "mcp",
          "server": "github"
        },
        "approval": {
          "required": true,
          "status": "approved",
          "principal": {
            "type": "user",
            "id": "usr_42"
          }
        },
        "input": {
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

These names do not require logging every internal agent event. Audit events should remain meaningful for accountability, security, product history, or evidence.

## Prompt and tool payloads

Raw prompts, tool inputs, and outputs SHOULD NOT be persisted by default. Prefer cryptographic digests, short policy-controlled previews, or references to evidence retained elsewhere.

A preview is for human readability, not integrity. A digest is for identity/correlation and does not prove who produced the content unless backed by stronger evidence or a signature.

## Evidence

An agent's own report of a tool call is normally `self_reported`. The service that authorizes or executes the tool operation may produce `authoritative` evidence. AuditSpec can preserve both instead of flattening them into a single truth claim.

## Subagents

Do not collapse subagents into the root user or parent agent. Preserve the immediate subagent as Core `actor` and express responsibility through Core `delegation`. `parent_agent` in this profile is optional descriptive context, not a replacement for delegation semantics.
