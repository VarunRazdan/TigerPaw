---
summary: "CLI reference for `tigerpaw reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `tigerpaw reset`

Reset local config/state (keeps the CLI installed).

```bash
tigerpaw backup create
tigerpaw reset
tigerpaw reset --dry-run
tigerpaw reset --scope config+creds+sessions --yes --non-interactive
```

Run `tigerpaw backup create` first if you want a restorable snapshot before removing local state.
