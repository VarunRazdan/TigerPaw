# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in Tigerpaw, please report it responsibly:

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email security reports to: security@tigerpaw.dev
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to acknowledge reports within 48 hours and provide a fix within 7 days for critical issues.

## Security Architecture

### Trading Infrastructure

- All orders are gated by `TradingPolicyEngine.evaluateOrder()` before execution
- **Fail-safe enforcement**: Extensions block orders with a hard error when the policy engine is unavailable — they never silently skip risk controls
- Kill switch provides instant trading halt across all extensions
- HMAC-SHA256 chain-linked audit log at `~/.tigerpaw/trading/audit.jsonl`
- Daily risk limits: loss %, drawdown %, spend caps, position limits
- API secrets are never transmitted as plaintext headers — all exchange integrations use HMAC or RSA request signing

### Credential Storage

- macOS: Native Keychain via `/usr/bin/security`
- Linux: `secret-tool` (libsecret) when available
- Fallback: AES-256-GCM encrypted file with PBKDF2 key derivation (100K iterations, SHA-512)
- Credentials never stored in plaintext config files (SecretRef system)

### Gateway Security

- CORS allowlist enforcement (no wildcards)
- Per-IP sliding-window rate limiting (120 req/min, 20 req/sec burst)
- Request body size limits (1MB HTTP, 256KB WebSocket)
- Token-based authentication for gateway API

### Extension Security

- Declarative permission model (network, trading, filesystem, secrets) -- displayed in Security Dashboard and checked by `tigerpaw doctor`
- Ed25519 signature verification module implemented but not yet wired into the plugin loader (planned for a future release)
- Permission validation during `tigerpaw doctor` security audit
- Extensions MUST NOT use unsafe casts to access trading config — use the typed `api.tradingPolicyConfig` field
