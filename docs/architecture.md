# AuditSpec architecture

AuditSpec is designed as a small semantic core surrounded by optional executable layers.

## Ecosystem layers

```mermaid
flowchart TD
    Core[AuditSpec Core] --> Profiles[Profiles]
    Core --> Conformance[Conformance]
    Core --> Mappings[Mappings]
    Core --> Adapters[Language / Framework Adapters]

    Profiles --> Inspector[AuditSpec Inspector]
    Conformance --> Inspector
    Adapters --> Inspector
    Mappings --> Inspector

    Inspector --> CLI[CLI]
    Inspector --> MCP[MCP Server]
    Inspector --> CI[GitHub Action / CI]
    Inspector --> Cloud[AuditSpec Cloud]

    Evidence[Runtime Evidence\nOTel / OS / eBPF] --> Inspector
    Compliance[OSCAL / Controls] --> Cloud
    MCP --> Agents[Coding / AI Agents]
    CI --> PR[Pull Request Findings]
```

## Semantic event model

```mermaid
flowchart LR
    Actor[Immediate Actor] --> Action[Audited Action]
    Delegation[Delegation Chain] --> Actor
    Action --> Auth[Authorization Decision]
    Auth --> Result[Execution Result]
    Action --> Targets[Targets]
    Action --> Subjects[Affected Subjects]
    Result --> Changes[Changes / Redaction]
    Action --> Correlation[Request / Trace / Agent Correlation]
    Action --> Evidence[Evidence Set]
    Evidence --> Trust[Evidence Trust]
```

Authorization and execution result are deliberately separate. `allowed` does not imply `succeeded`.

## Mutation recording path

```mermaid
sequenceDiagram
    participant A as Actor / Agent
    participant P as Policy
    participant S as Service
    participant DB as Database
    participant O as Outbox / Audit Sink

    A->>S: semantic command
    S->>P: authorize
    P-->>S: allowed / denied

    alt denied
        S->>O: durable denied audit event
        S-->>A: denied
    else allowed
        S->>DB: begin transaction
        S->>DB: business mutation
        S->>DB: audit record or outbox record
        DB-->>S: commit
        S-->>A: result
    end
```

When mutation and audit storage share a transaction, both should commit or roll back together. When they cannot, a reliable outbox/reconciliation design is preferred over fire-and-forget delivery.

## Agent / MCP flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Agent
    participant M as MCP Tool
    participant S as Application Service
    participant DB as Database

    U->>A: goal / instruction
    A->>M: tool call
    M->>S: authenticated request
    S->>S: authorization decision
    S->>DB: business mutation + authoritative audit evidence
    DB-->>S: commit
    S-->>M: result
    M-->>A: tool result

    Note over A,S: Correlate session / turn / tool_call / trace / span
    Note over A,S: Agent report may be self-reported; service execution may be authoritative
```

## Evidence graph

```mermaid
flowchart TD
    Event[invoice.approve assertion]
    Auth[Authorization-service evidence\nauthoritative]
    Exec[ERP execution evidence\nauthoritative]
    Agent[Agent report\nself_reported]
    Trace[OpenTelemetry trace\nruntime corroboration]
    Kernel[OS / eBPF observation\nruntime corroboration]

    Auth --> Event
    Exec --> Event
    Agent --> Event
    Trace --> Exec
    Kernel --> Exec
```

A kernel observation may strongly corroborate that a process opened a connection or wrote data, but it does not automatically know that those bytes semantically represented `invoice.approve`.

## Continuous assurance loop

```mermaid
flowchart LR
    Discover[Discover] --> Assess[Assess]
    Assess --> Explain[Explain gaps]
    Explain --> Remediate[Remediate]
    Remediate --> Verify[Verify]
    Verify --> Watch[Continuously watch]
    Watch --> Assess
```

The same Inspector result should be consumable by CLI, CI, MCP, IDEs, GitHub Checks, and optional cloud services.

## GitHub ratchet model

```mermaid
flowchart LR
    Base[main baseline\nexisting findings] --> Diff[PR assessment]
    Diff --> New[New findings]
    Diff --> Fixed[Resolved findings]
    Diff --> Existing[Existing baseline debt]
    New --> Warn[Inline warnings]
    Fixed --> Improve[Coverage improvement]
```

The default PR experience should not repeat every historical problem. It should show total coverage while emphasizing regressions introduced by the current change and improvements that close old gaps.
