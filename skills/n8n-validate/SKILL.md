---
name: n8n-validate
description: Validate n8n workflow JSON against n8n's real node schemas before it is imported, pushed or handed to the user. Use whenever a workflow export (.json with nodes + connections) is created or edited.
---

# n8n Validate

Checks a workflow file offline with n8n-as-code's validator (`n8nac skills
validate`, pinned): unknown node types, connections to missing nodes,
non-existent `typeVersion`s, unknown or misspelled parameters. No n8n
connection, no API key, telemetry off. Read-only.

## Run

From the repo root, one call per changed workflow file:

```bash
DO_NOT_TRACK=1 N8NAC_TELEMETRY_DISABLED=1 npx -y n8nac@2.7.0 skills validate <workflow.json>
```

Done when every changed workflow file has been validated and the result
relayed.

## Reading the result

- `❌ Workflow validation failed` → fix every listed error before import.
  Errors name the node in brackets and, for versions, the valid values.
- `Unknown parameter: "<name>"` (warning) → almost always a typo or a
  parameter from another node version; fix it or say why it is intended.
- `Node is missing "id"` (warning) → normal for exported/sanitized
  workflows; ignore. Do not pass `--strict`, which turns these into errors.
- `⚠️ Workflow is valid but has warnings` with only missing-id warnings →
  valid.

## Limits

- Static check only: credentials, expressions, SQL inside nodes and runtime
  behaviour are not exercised. A valid file can still fail on first run.
- Schemas track the latest stable n8n; raise the pinned version when the
  instance upgrades and a newer node version is reported as unknown.
