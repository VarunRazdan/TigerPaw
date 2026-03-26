import channels from "./channels.json";
import common from "./common.json";
import config from "./config.json";
import connect from "./connect.json";
import dashboard from "./dashboard.json";
import notifications from "./notifications.json";
import platforms from "./platforms.json";
import security from "./security.json";
import settings from "./settings.json";
import trading from "./trading.json";

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
} as Record<string, unknown>;
