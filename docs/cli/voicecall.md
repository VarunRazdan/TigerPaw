---
summary: "CLI reference for `tigerpaw voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
title: "voicecall"
---

# `tigerpaw voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:

- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
tigerpaw voicecall status --call-id <id>
tigerpaw voicecall call --to "+15555550123" --message "Hello" --mode notify
tigerpaw voicecall continue --call-id <id> --message "Any questions?"
tigerpaw voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
tigerpaw voicecall expose --mode serve
tigerpaw voicecall expose --mode funnel
tigerpaw voicecall expose --mode off
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.
