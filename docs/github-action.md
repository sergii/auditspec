# AuditSpec GitHub Action

The repository includes an advisory composite GitHub Action that runs AuditSpec Inspector entirely inside the GitHub Actions runner.

## Usage

```yaml
name: AuditSpec

on:
  pull_request:

permissions:
  contents: read

jobs:
  auditspec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: sergii/auditspec@v0.1
        with:
          baseline: auto
```

During the working-draft phase, pin to an explicit commit or branch only for experimentation. A stable tag should be used after the first release.

## Pull request behavior

With `baseline: auto`, the action:

1. Inspects the checked-out pull request revision.
2. Fetches `GITHUB_BASE_REF` when available.
3. Creates a temporary detached worktree for the base revision.
4. Inspects the base revision.
5. Compares Assessment Reports by stable finding fingerprint.
6. Emits inline GitHub `warning` annotations for **new findings only**.
7. Writes new/resolved/existing counts and coverage delta to the Job Summary.
8. Exits successfully even when findings exist.

This implements the default ratchet model:

```text
existing debt -> visible in summary
new debt      -> inline warning
resolved debt -> positive diff
merge         -> not blocked by AuditSpec
```

Set `baseline: off` to inspect only the current checkout. In that mode all current findings are surfaced.

## Outputs

The action exposes:

- `report-path` - generated head Assessment Report JSON
- `diff-path` - generated Assessment Diff JSON when a baseline was available

The files remain on the runner. A workflow may explicitly upload them as artifacts if desired.

## Privacy and trust

The initial action does not send source code or Assessment Reports to an AuditSpec service. Source inspection, comparison, and annotations run locally on the GitHub-hosted or self-hosted runner.

The composite action currently installs the repository-local TypeScript reference dependencies at runtime. A later release may ship a prebuilt or containerized distribution for faster startup and stronger supply-chain pinning.

## Non-blocking by default

AuditSpec findings are not automatically vulnerabilities or compliance failures. Heuristic adapters preserve confidence and uncertainty, so the default action uses warnings rather than failing the workflow.

Future policy modes may allow projects to fail only on configured classes of new high-confidence findings, while keeping AuditSpec Core and the Assessment Report policy-neutral.
