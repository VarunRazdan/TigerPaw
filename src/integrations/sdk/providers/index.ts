/**
 * Provider barrel — imports all SDK integration providers.
 *
 * Each provider calls registerIntegration() at module scope,
 * so importing this file registers all providers at once.
 */

import "./http-request.js";
import "./slack.js";
import "./google-sheets.js";
import "./github.js";
import "./openai.js";
import "./anthropic.js";
