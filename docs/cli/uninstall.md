---
summary: "CLI reference for `tigerpaw uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "uninstall"
---

# `tigerpaw uninstall`

Uninstall the gateway service + local data (CLI remains).

```bash
tigerpaw backup create
tigerpaw uninstall
tigerpaw uninstall --all --yes
tigerpaw uninstall --dry-run
```

Run `tigerpaw backup create` first if you want a restorable snapshot before removing state or workspaces.
