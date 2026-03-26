import assistant from "./assistant.json";
import channels from "./channels.json";
import common from "./common.json";
import config from "./config.json";
import connect from "./connect.json";
import dashboard from "./dashboard.json";
import inbox from "./inbox.json";
import mcp from "./mcp.json";
import models from "./models.json";
import notifications from "./notifications.json";
import platforms from "./platforms.json";
import security from "./security.json";
import settings from "./settings.json";
import trading from "./trading.json";
import workflows from "./workflows.json";

export default {
  common,
  dashboard,
  trading,
  channels,
  security,
  config,
  notifications,
  connect,
  settings,
  platforms,
  assistant,
  inbox,
  workflows,
  mcp,
  models,
} as Record<string, unknown>;
