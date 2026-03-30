export type ConnectCredential = {
  field: string;
  label: string;
  envVar?: string;
  help: string;
  sensitive?: boolean; // default true (password input), set false for emails/paths/hosts
};

export type ConnectInfo = {
  name: string;
  iconPath: string;
  setupUrl: string;
  description: string;
  configSection: string; // e.g. "plugins.entries.alpaca.config" or "telegram"
  credentials: ConnectCredential[];
  steps: string[];
  hasSandbox: boolean;
  sandboxLabel?: string;
};

export const TRADING_CONNECT_INFO: Record<string, ConnectInfo> = {
  alpaca: {
    name: "Alpaca",
    iconPath: "/icons/trading-platforms/alpaca.svg",
    setupUrl: "https://app.alpaca.markets/brokerage/account/api-keys",
    description: "Commission-free stock & ETF trading",
    configSection: "plugins.entries.alpaca.config",
    credentials: [
      {
        field: "apiKeyId",
        label: "API Key ID",
        envVar: "ALPACA_API_KEY_ID",
        help: "Found in your Alpaca dashboard under API Keys",
      },
      {
        field: "apiSecretKey",
        label: "API Secret Key",
        envVar: "ALPACA_API_SECRET_KEY",
        help: "Generated when you create an API key",
      },
    ],
    steps: [
      "Create an Alpaca account at alpaca.markets",
      "Go to Account > API Keys",
      "Generate a new API key pair",
      "Add the keys to your tigerpaw.json config",
    ],
    hasSandbox: true,
    sandboxLabel: "paper",
  },
  polymarket: {
    name: "Polymarket",
    iconPath: "/icons/trading-platforms/polymarket.svg",
    setupUrl: "https://polymarket.com/",
    description: "Prediction market trading via CLOB API",
    configSection: "plugins.entries.polymarket.config",
    credentials: [
      {
        field: "apiKey",
        label: "CLOB API Key",
        envVar: "POLYMARKET_API_KEY",
        help: "Your Polymarket CLOB API key",
      },
      {
        field: "apiSecret",
        label: "CLOB API Secret",
        envVar: "POLYMARKET_API_SECRET",
        help: "Your CLOB API secret",
      },
      {
        field: "passphrase",
        label: "CLOB Passphrase",
        envVar: "POLYMARKET_PASSPHRASE",
        help: "Your CLOB passphrase",
      },
      {
        field: "privateKey",
        label: "Ethereum Private Key",
        envVar: "POLYMARKET_PRIVATE_KEY",
        help: "Hex private key for on-chain order signing",
      },
    ],
    steps: [
      "Create a Polymarket account",
      "Enable API access in your account settings",
      "Generate CLOB API credentials",
      "Export your Ethereum wallet private key",
      "Add all credentials to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  kalshi: {
    name: "Kalshi",
    iconPath: "/icons/trading-platforms/kalshi.svg",
    setupUrl: "https://docs.kalshi.com/",
    description: "Event contract trading with RSA-signed requests",
    configSection: "plugins.entries.kalshi.config",
    credentials: [
      {
        field: "email",
        label: "Account Email",
        help: "Your Kalshi account email",
        sensitive: false,
      },
      {
        field: "apiKeyId",
        label: "API Key ID",
        envVar: "KALSHI_API_KEY_ID",
        help: "Found in Kalshi API settings",
      },
      {
        field: "privateKeyPath",
        label: "RSA Private Key Path",
        help: "Path to your RSA PEM file (e.g., ~/.kalshi/private.pem)",
        sensitive: false,
      },
    ],
    steps: [
      "Create a Kalshi account at kalshi.com",
      "Go to Account > API",
      "Generate an RSA key pair",
      "Save the private key PEM file locally",
      "Add credentials to your tigerpaw.json config",
    ],
    hasSandbox: true,
    sandboxLabel: "demo",
  },
  manifold: {
    name: "Manifold Markets",
    iconPath: "/icons/trading-platforms/manifold.svg",
    setupUrl: "https://docs.manifold.markets/api",
    description: "Play-money prediction markets (Mana currency)",
    configSection: "plugins.entries.manifold.config",
    credentials: [
      {
        field: "apiKey",
        label: "API Key",
        envVar: "MANIFOLD_API_KEY",
        help: "Optional — works read-only without it",
      },
    ],
    steps: [
      "Create a Manifold account at manifold.markets",
      "Go to your profile settings",
      "Generate an API key",
      "Add the key to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  coinbase: {
    name: "Coinbase",
    iconPath: "/icons/trading-platforms/coinbase.svg",
    setupUrl: "https://coinbase.com/developer-platform",
    description: "Crypto spot trading via Coinbase Advanced Trade",
    configSection: "plugins.entries.coinbase.config",
    credentials: [
      {
        field: "apiKey",
        label: "CDP Key Name",
        help: "Format: organizations/{org_id}/apiKeys/{key_id}",
      },
      {
        field: "apiSecret",
        label: "EC Private Key (PEM)",
        envVar: "COINBASE_API_SECRET",
        help: "EC P-256 private key in PEM format for ES256 JWT signing",
      },
    ],
    steps: [
      "Create a Coinbase Developer Platform account",
      "Create a new API key with Advanced Trade permissions",
      "Download the EC P-256 private key PEM file",
      "Add the key name and PEM to your tigerpaw.json config",
    ],
    hasSandbox: true,
    sandboxLabel: "sandbox",
  },
  ibkr: {
    name: "Interactive Brokers",
    iconPath: "/icons/trading-platforms/interactive-brokers.svg",
    setupUrl: "https://www.interactivebrokers.com/",
    description: "Multi-asset trading (stocks, options, futures, forex)",
    configSection: "plugins.entries.ibkr.config",
    credentials: [
      {
        field: "accountId",
        label: "Account ID",
        envVar: "IBKR_ACCOUNT_ID",
        help: "Your IB account number",
        sensitive: false,
      },
      {
        field: "gatewayHost",
        label: "Gateway Host",
        help: "IB Client Portal Gateway address (default: localhost:5000)",
        sensitive: false,
      },
    ],
    steps: [
      "Create an Interactive Brokers account",
      "Download and run IB Client Portal Gateway",
      "Authenticate the gateway with your IB credentials",
      "Add your account ID to tigerpaw.json config",
    ],
    hasSandbox: true,
    sandboxLabel: "paper",
  },
  binance: {
    name: "Binance",
    iconPath: "/icons/trading-platforms/binance.svg",
    setupUrl: "https://www.binance.com/en/account/api-management",
    description: "Crypto spot trading with HMAC-SHA256 signed requests",
    configSection: "plugins.entries.binance.config",
    credentials: [
      {
        field: "apiKey",
        label: "API Key",
        envVar: "BINANCE_API_KEY",
        help: "Created in Binance API Management",
      },
      {
        field: "apiSecret",
        label: "API Secret",
        envVar: "BINANCE_API_SECRET",
        help: "Shown once when you create the key",
      },
    ],
    steps: [
      "Log into Binance and go to API Management",
      "Create a new API key (enable Spot trading)",
      "Copy the API key and secret immediately",
      "Add both to your tigerpaw.json config",
    ],
    hasSandbox: true,
    sandboxLabel: "testnet",
  },
  kraken: {
    name: "Kraken",
    iconPath: "/icons/trading-platforms/kraken.svg",
    setupUrl: "https://docs.kraken.com/api/docs/guides/global-intro",
    description: "Crypto spot + margin trading with HMAC-SHA512 auth",
    configSection: "plugins.entries.kraken.config",
    credentials: [
      {
        field: "apiKey",
        label: "API Key",
        envVar: "KRAKEN_API_KEY",
        help: "Created in Kraken API settings",
      },
      {
        field: "apiSecret",
        label: "API Secret (Base64)",
        envVar: "KRAKEN_API_SECRET",
        help: "Base64-encoded secret from Kraken",
      },
    ],
    steps: [
      "Go to Kraken API documentation",
      "Create a new API key with trade permissions",
      "Copy the key and base64 secret",
      "Add both to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  dydx: {
    name: "dYdX v4",
    iconPath: "/icons/trading-platforms/dydx.svg",
    setupUrl: "https://dydx.trade/",
    description: "Decentralized perpetual futures on Cosmos",
    configSection: "plugins.entries.dydx.config",
    credentials: [
      {
        field: "mnemonic",
        label: "Wallet Mnemonic",
        envVar: "DYDX_MNEMONIC",
        help: "12-24 word Cosmos wallet seed phrase",
      },
    ],
    steps: [
      "Create a dYdX v4 account at dydx.trade",
      "Export your Cosmos wallet mnemonic phrase",
      "Add the mnemonic to your tigerpaw.json config",
      "Start in testnet mode to verify setup",
    ],
    hasSandbox: true,
    sandboxLabel: "testnet",
  },
};

export const CHANNEL_CONNECT_INFO: Record<string, ConnectInfo> = {
  discord: {
    name: "Discord",
    iconPath: "/icons/messaging-channels/discord.svg",
    setupUrl: "https://discord.com/developers/applications",
    description: "Discord agent for guilds, DMs, and voice channels",
    configSection: "discord",
    credentials: [
      {
        field: "token",
        label: "Bot Token",
        envVar: "DISCORD_BOT_TOKEN",
        help: "Found in Bot section of your Discord application",
      },
    ],
    steps: [
      "Go to discord.com/developers/applications",
      "Create a new application",
      "Go to Bot section and create a bot",
      "Copy the bot token",
      "Enable Message Content Intent under Privileged Intents",
      "Add the token to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  telegram: {
    name: "Telegram",
    iconPath: "/icons/messaging-channels/telegram.svg",
    setupUrl: "https://t.me/BotFather",
    description: "Telegram agent for chats and groups",
    configSection: "telegram",
    credentials: [
      {
        field: "botToken",
        label: "Bot Token",
        help: "Get from @BotFather on Telegram (format: 123456:ABC-xyz)",
      },
    ],
    steps: [
      "Open Telegram and message @BotFather",
      "Send /newbot and follow the prompts",
      "Copy the bot token provided",
      "Add the token to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  slack: {
    name: "Slack",
    iconPath: "/icons/messaging-channels/slack.svg",
    setupUrl: "https://api.slack.com/apps",
    description: "Slack agent for workspaces and channels",
    configSection: "slack",
    credentials: [
      {
        field: "botToken",
        label: "Bot Token",
        help: "Starts with xoxb- (from OAuth & Permissions)",
      },
      {
        field: "appToken",
        label: "App Token",
        help: "Starts with xapp- (from Basic Information > App-Level Tokens)",
      },
    ],
    steps: [
      "Go to api.slack.com/apps and create a new app",
      "Enable Socket Mode in Settings",
      "Add bot scopes under OAuth & Permissions",
      "Install the app to your workspace",
      "Copy the Bot Token and App Token",
      "Add both tokens to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  signal: {
    name: "Signal",
    iconPath: "/icons/messaging-channels/signal.svg",
    setupUrl: "https://github.com/AsamK/signal-cli",
    description: "Signal messenger via signal-cli daemon",
    configSection: "signal",
    credentials: [
      {
        field: "account",
        label: "Phone Number",
        help: "E.164 format phone number registered with Signal",
        sensitive: false,
      },
    ],
    steps: [
      "Install signal-cli from GitHub",
      "Register or link a phone number",
      "Start signal-cli in daemon mode",
      "Add the phone number to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  imessage: {
    name: "iMessage",
    iconPath: "/icons/messaging-channels/imessage.svg",
    setupUrl: "https://support.apple.com/messages",
    description: "iMessage integration (macOS only)",
    configSection: "imessage",
    credentials: [],
    steps: [
      "Requires macOS with Messages app",
      "Install the imsg CLI tool",
      "Grant Full Disk Access in System Settings",
      "Add iMessage config to your tigerpaw.json",
    ],
    hasSandbox: false,
  },
  whatsapp: {
    name: "WhatsApp",
    iconPath: "/icons/messaging-channels/whatsapp.svg",
    setupUrl: "https://web.whatsapp.com/",
    description: "WhatsApp via browser-based pairing",
    configSection: "whatsapp",
    credentials: [],
    steps: [
      "Enable WhatsApp in your tigerpaw.json config",
      "Start Tigerpaw — a QR code will appear",
      "Scan the QR code with WhatsApp on your phone",
      "Connection persists after initial pairing",
    ],
    hasSandbox: false,
  },
  matrix: {
    name: "Matrix",
    iconPath: "/icons/messaging-channels/matrix.svg",
    setupUrl: "https://matrix.org/",
    description: "Matrix protocol for decentralized chat",
    configSection: "matrix",
    credentials: [
      {
        field: "homeserverUrl",
        label: "Homeserver URL",
        help: "e.g., https://matrix.org",
        sensitive: false,
      },
      { field: "userId", label: "User ID", help: "e.g., @bot:matrix.org", sensitive: false },
      {
        field: "accessToken",
        label: "Access Token",
        help: "Generate from Element > Settings > Help & About",
      },
    ],
    steps: [
      "Create a Matrix account on your homeserver",
      "Generate an access token via Element or API",
      "Add homeserver URL and token to tigerpaw.json",
    ],
    hasSandbox: false,
  },
  "ms-teams": {
    name: "MS Teams",
    iconPath: "/icons/messaging-channels/ms-teams.svg",
    setupUrl: "https://dev.teams.microsoft.com/",
    description: "Microsoft Teams agent via Azure",
    configSection: "msteams",
    credentials: [
      {
        field: "appId",
        label: "Azure App ID",
        help: "From Azure Bot registration",
        sensitive: false,
      },
      { field: "appSecret", label: "App Secret", help: "Client secret from Azure AD" },
      { field: "tenantId", label: "Tenant ID", help: "Your Azure AD tenant ID", sensitive: false },
    ],
    steps: [
      "Register a bot in Azure Portal",
      "Create an Azure AD app registration",
      "Configure the messaging endpoint",
      "Add credentials to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  irc: {
    name: "IRC",
    iconPath: "/icons/messaging-channels/irc.svg",
    setupUrl: "https://libera.chat/",
    description: "Internet Relay Chat",
    configSection: "irc",
    credentials: [
      { field: "server", label: "Server", help: "e.g., irc.libera.chat", sensitive: false },
      { field: "nick", label: "Nickname", help: "Bot nickname on IRC", sensitive: false },
      { field: "channel", label: "Channel", help: "e.g., #mychannel", sensitive: false },
    ],
    steps: [
      "Choose an IRC network (e.g., Libera Chat)",
      "Register a nickname if required",
      "Add server, nick, and channel to tigerpaw.json",
    ],
    hasSandbox: false,
  },
  line: {
    name: "Line",
    iconPath: "/icons/messaging-channels/line.svg",
    setupUrl: "https://developers.line.biz/",
    description: "LINE Messaging API agent",
    configSection: "line",
    credentials: [
      {
        field: "channelAccessToken",
        label: "Channel Access Token",
        help: "From LINE Developers Console",
      },
      { field: "channelSecret", label: "Channel Secret", help: "From LINE Developers Console" },
    ],
    steps: [
      "Create a LINE Developers account",
      "Create a Messaging API channel",
      "Copy the channel access token and secret",
      "Add both to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  nostr: {
    name: "Nostr",
    iconPath: "/icons/messaging-channels/nostr.svg",
    setupUrl: "https://nostr.com/",
    description: "Nostr decentralized protocol",
    configSection: "nostr",
    credentials: [
      {
        field: "privateKey",
        label: "Private Key (nsec)",
        help: "Nostr private key in nsec format",
      },
    ],
    steps: [
      "Generate a Nostr keypair",
      "Add your nsec private key to tigerpaw.json",
      "Configure relay URLs as needed",
    ],
    hasSandbox: false,
  },
  "google-chat": {
    name: "Google Chat",
    iconPath: "/icons/messaging-channels/google-chat.svg",
    setupUrl: "https://console.cloud.google.com/",
    description: "Google Chat via Google Workspace",
    configSection: "googlechat",
    credentials: [
      {
        field: "serviceAccountKey",
        label: "Service Account JSON",
        help: "GCP service account key file path",
        sensitive: false,
      },
    ],
    steps: [
      "Create a GCP project",
      "Enable the Google Chat API",
      "Create a service account and download the JSON key",
      "Add the key path to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  mattermost: {
    name: "Mattermost",
    iconPath: "/icons/messaging-channels/mattermost.svg",
    setupUrl: "https://mattermost.com/",
    description: "Self-hosted Mattermost server",
    configSection: "mattermost",
    credentials: [
      { field: "url", label: "Server URL", help: "Your Mattermost server URL", sensitive: false },
      { field: "token", label: "Bot Token", help: "Personal access token or bot token" },
    ],
    steps: [
      "Go to your Mattermost server settings",
      "Create a bot account or personal access token",
      "Add the server URL and token to tigerpaw.json",
    ],
    hasSandbox: false,
  },
  twitch: {
    name: "Twitch",
    iconPath: "/icons/messaging-channels/twitch.svg",
    setupUrl: "https://dev.twitch.tv/console",
    description: "Twitch chat integration",
    configSection: "twitch",
    credentials: [
      {
        field: "oauthToken",
        label: "OAuth Token",
        help: "Twitch OAuth token for chat (oauth:...)",
      },
      { field: "channel", label: "Channel", help: "Twitch channel name to join", sensitive: false },
    ],
    steps: [
      "Register an app at dev.twitch.tv/console",
      "Generate an OAuth token with chat scopes",
      "Add the token and channel to tigerpaw.json",
    ],
    hasSandbox: false,
  },
  feishu: {
    name: "Feishu",
    iconPath: "/icons/messaging-channels/feishu.svg",
    setupUrl: "https://open.feishu.cn/",
    description: "Feishu (Lark) messaging platform",
    configSection: "feishu",
    credentials: [
      { field: "appId", label: "App ID", help: "Feishu app ID", sensitive: false },
      { field: "appSecret", label: "App Secret", help: "Feishu app secret" },
    ],
    steps: [
      "Create an app at open.feishu.cn",
      "Configure bot permissions",
      "Add app ID and secret to tigerpaw.json",
    ],
    hasSandbox: false,
  },
  zalo: {
    name: "Zalo",
    iconPath: "/icons/messaging-channels/zalo.svg",
    setupUrl: "https://developers.zalo.me/",
    description: "Zalo Official Account messaging",
    configSection: "zalo",
    credentials: [
      { field: "oaId", label: "OA ID", help: "Zalo Official Account ID", sensitive: false },
      { field: "accessToken", label: "Access Token", help: "OA access token from Zalo developers" },
    ],
    steps: [
      "Create a Zalo Official Account",
      "Register at developers.zalo.me",
      "Get your OA ID and access token",
      "Add credentials to tigerpaw.json",
    ],
    hasSandbox: false,
  },
  tlon: {
    name: "Tlon",
    iconPath: "/icons/messaging-channels/tlon.svg",
    setupUrl: "https://tlon.io/",
    description: "Urbit-based messaging via Tlon",
    configSection: "tlon",
    credentials: [
      {
        field: "ship",
        label: "Ship Name",
        help: "Your Urbit ship name (e.g., ~zod)",
        sensitive: false,
      },
      { field: "code", label: "Access Code", help: "Your Urbit ship access code" },
    ],
    steps: [
      "Set up an Urbit ship (planet or star)",
      "Get your ship name and access code",
      "Add both to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  "synology-chat": {
    name: "Synology Chat",
    iconPath: "/icons/messaging-channels/synology-chat.svg",
    setupUrl: "https://www.synology.com/en-us/dsm/feature/chat",
    description: "Synology Chat via webhook",
    configSection: "synology-chat",
    credentials: [
      {
        field: "webhookUrl",
        label: "Webhook URL",
        help: "Incoming webhook URL from Synology Chat",
        sensitive: false,
      },
    ],
    steps: [
      "Open Synology Chat on your NAS",
      "Create an incoming webhook integration",
      "Copy the webhook URL",
      "Add it to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  "nextcloud-talk": {
    name: "Nextcloud Talk",
    iconPath: "/icons/messaging-channels/nextcloud-talk.svg",
    setupUrl: "https://nextcloud.com/talk/",
    description: "Nextcloud Talk messaging",
    configSection: "nextcloud-talk",
    credentials: [
      {
        field: "serverUrl",
        label: "Server URL",
        help: "Your Nextcloud server URL",
        sensitive: false,
      },
      { field: "token", label: "App Token", help: "Nextcloud app password or token" },
    ],
    steps: [
      "Log into your Nextcloud instance",
      "Generate an app password in Settings > Security",
      "Add server URL and token to tigerpaw.json",
    ],
    hasSandbox: false,
  },
  lobster: {
    name: "Lobster",
    iconPath: "/icons/messaging-channels/lobster.svg",
    setupUrl: "https://lobste.rs/",
    description: "Lobsters community integration",
    configSection: "lobster",
    credentials: [{ field: "apiKey", label: "API Key", help: "Lobsters API key" }],
    steps: [
      "Create a Lobsters account",
      "Generate an API key from settings",
      "Add the key to your tigerpaw.json config",
    ],
    hasSandbox: false,
  },
  bluebubbles: {
    name: "BlueBubbles",
    iconPath: "/icons/messaging-channels/bluebubbles.svg",
    setupUrl: "https://bluebubbles.app/",
    description: "iMessage bridge via BlueBubbles server",
    configSection: "bluebubbles",
    credentials: [
      {
        field: "serverUrl",
        label: "Server URL",
        help: "BlueBubbles server address",
        sensitive: false,
      },
      { field: "password", label: "Password", help: "BlueBubbles server password" },
    ],
    steps: [
      "Install BlueBubbles server on a Mac",
      "Configure the server and set a password",
      "Add server URL and password to tigerpaw.json",
    ],
    hasSandbox: false,
  },
};
