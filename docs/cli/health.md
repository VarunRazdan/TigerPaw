---
summary: "CLI reference for `tigerpaw health` (gateway health endpoint via RPC)"
read_when:
  - You want to quickly check the running Gateway’s health
title: "health"
---

# `tigerpaw health`

Fetch health from the running Gateway.

```bash
tigerpaw health
tigerpaw health --json
tigerpaw health --verbose
```

Notes:

- `--verbose` runs live probes and prints per-account timings when multiple accounts are configured.
- Output includes per-agent session stores when multiple agents are configured.
