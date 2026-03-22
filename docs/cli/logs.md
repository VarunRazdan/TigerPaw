---
summary: "CLI reference for `tigerpaw logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `tigerpaw logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
tigerpaw logs
tigerpaw logs --follow
tigerpaw logs --json
tigerpaw logs --limit 500
tigerpaw logs --local-time
tigerpaw logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
