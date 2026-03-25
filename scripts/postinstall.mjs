#!/usr/bin/env node

// Show a welcome message after global npm install.
// Silently skip during dev installs (pnpm install) and CI.
if (process.env.CI || process.env.OPENCLAW_TEST_FAST) {
  process.exit(0);
}

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log("");
console.log(bold("  Tigerpaw installed successfully!"));
console.log("");
console.log(`  Get started:  ${bold("tigerpaw start")}`);
console.log(dim("  Creates config, starts the gateway, and opens the dashboard."));
console.log("");
