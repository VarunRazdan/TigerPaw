const DEFAULT_TAGLINE = "Local-first AI gateway with claws.";
export type TaglineMode = "random" | "default" | "off";

const HOLIDAY_TAGLINES = {
  newYear:
    "New Year's Day: New year, fresh portfolio—may your Sharpe ratio stay sharp and your drawdowns stay shallow.",
  lunarNewYear:
    "Lunar New Year: May your trades be prosperous, your latency low, and your merge conflicts resolved before the fireworks.",
  christmas:
    "Christmas: The tiger's delivering gifts—zero slippage, full risk controls, and a dashboard that actually sparks joy.",
  eid: "Eid al-Fitr: Positions closed, profits booked, good vibes committed to main with clean history.",
  diwali:
    "Diwali: Light up the terminal—today we celebrate green candles, clean diffs, and dashboards that glow.",
  easter:
    "Easter: Found your missing API key in the env—consider it a CLI egg hunt with better risk management.",
  hanukkah:
    "Hanukkah: Eight nights, eight exchanges, zero downtime—may your gateway stay lit and your fills stay fast.",
  halloween:
    "Halloween: Beware haunted dependencies, phantom fills, and the ghost of node_modules past.",
  thanksgiving:
    "Thanksgiving: Grateful for stable WebSockets, working kill switches, and a bot that watches the market so you don't have to.",
  valentines:
    "Valentine's Day: Roses are red, candles are green—I'll watch your positions so you can be with your Valentine.",
} as const;

const TAGLINES: string[] = [
  "Nine exchanges. One paw print. Zero permission to sleep.",
  "The jungle runs on risk controls and good instincts.",
  "Sharpe ratio looking sharp. Sortino even sharper.",
  "Your portfolio called. It wants better automation.",
  "Stalking alpha across nine exchanges simultaneously.",
  "Patient like a tiger. Fast like your fill rate should be.",
  "Every trade reviewed. Every position tracked. Every risk measured.",
  "I don't chase—I wait, calculate, then pounce.",
  "Drawdown detected. Kill switch ready. Tiger don't panic.",
  "Self-hosted means your data stays in your den.",
  "Running silently in the background. Watching everything.",
  "Gateway online. Risk controls armed. Claws sharpened.",
  "Local-first, privacy-native, dangerously well-organized.",
  "Your AI assistant, your risk engine, your trading journal—one CLI.",
  "MCP server running. Eight tools exposed. Agents welcome.",
  "I track P&L so you can track life.",
  "Backtest before you bet. That's the tiger way.",
  "Strategies in. Signals evaluated. Orders queued. You're welcome.",
  "Glassmorphism on the frontend. Cold logic on the backend.",
  "Ten languages, nine exchanges, one dashboard, zero excuses.",
  "The terminal is my jungle. Efficiency is my prey.",
  "I read candles better than your horoscope app.",
  "Volatility is just the jungle at night—navigable with the right instincts.",
  "Approval mode: manual. Confidence mode: maximum.",
  "Your kill switch is one keystroke away. Sleep well.",
  "Built different. Tested obsessively. Deployed locally.",
  "I don't predict markets. I prepare for them.",
  "WebSocket connected. Polling as backup. Paranoia as a feature.",
  "Powered by open source and an unreasonable attention to detail.",
  "Type the command. Trust the process. Review the diff.",
  "Less FOMO, more DYOR, all from your terminal.",
  "Half dashboard, half trading desk, full predator.",
  "I've survived more breaking changes than a meme coin.",
  "Runs on a Raspberry Pi. Trades like a mainframe.",
  "Your second brain—except this one tracks Sharpe ratios.",
  "Deployed locally, trusted globally, debugged relentlessly.",
  "Open source means you audit the tiger, not the other way around.",
  "Like Bloomberg Terminal, but it runs on localhost and respects your privacy.",
  "Finally, a use for that always-on Mac Mini under your desk.",
  "Making 'I should automate my trading' actually happen.",
  "Inter font. Dark theme. Glassmorphism. Yes, we care about the details.",
  "I keep secrets like a vault—unless you console.log them in production.",
  "Somewhere between 'hello world' and 'hello Wall Street.'",
  "Workflows, strategies, signals—all orchestrated. All local. All yours.",
  "The only AI gateway that thinks in risk-adjusted returns. 🐅",
  HOLIDAY_TAGLINES.newYear,
  HOLIDAY_TAGLINES.lunarNewYear,
  HOLIDAY_TAGLINES.christmas,
  HOLIDAY_TAGLINES.eid,
  HOLIDAY_TAGLINES.diwali,
  HOLIDAY_TAGLINES.easter,
  HOLIDAY_TAGLINES.hanukkah,
  HOLIDAY_TAGLINES.halloween,
  HOLIDAY_TAGLINES.thanksgiving,
  HOLIDAY_TAGLINES.valentines,
];

type HolidayRule = (date: Date) => boolean;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

const onMonthDay =
  (month: number, day: number): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return parts.month === month && parts.day === day;
  };

const onSpecificDates =
  (dates: Array<[number, number, number]>, durationDays = 1): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return dates.some(([year, month, day]) => {
      if (parts.year !== year) {
        return false;
      }
      const start = Date.UTC(year, month, day);
      const current = Date.UTC(parts.year, parts.month, parts.day);
      return current >= start && current < start + durationDays * DAY_MS;
    });
  };

const inYearWindow =
  (
    windows: Array<{
      year: number;
      month: number;
      day: number;
      duration: number;
    }>,
  ): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    const window = windows.find((entry) => entry.year === parts.year);
    if (!window) {
      return false;
    }
    const start = Date.UTC(window.year, window.month, window.day);
    const current = Date.UTC(parts.year, parts.month, parts.day);
    return current >= start && current < start + window.duration * DAY_MS;
  };

const isFourthThursdayOfNovember: HolidayRule = (date) => {
  const parts = utcParts(date);
  if (parts.month !== 10) {
    return false;
  } // November
  const firstDay = new Date(Date.UTC(parts.year, 10, 1)).getUTCDay();
  const offsetToThursday = (4 - firstDay + 7) % 7; // 4 = Thursday
  const fourthThursday = 1 + offsetToThursday + 21; // 1st + offset + 3 weeks
  return parts.day === fourthThursday;
};

const HOLIDAY_RULES = new Map<string, HolidayRule>([
  [HOLIDAY_TAGLINES.newYear, onMonthDay(0, 1)],
  [
    HOLIDAY_TAGLINES.lunarNewYear,
    onSpecificDates(
      [
        [2025, 0, 29],
        [2026, 1, 17],
        [2027, 1, 6],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.eid,
    onSpecificDates(
      [
        [2025, 2, 30],
        [2025, 2, 31],
        [2026, 2, 20],
        [2027, 2, 10],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.diwali,
    onSpecificDates(
      [
        [2025, 9, 20],
        [2026, 10, 8],
        [2027, 9, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.easter,
    onSpecificDates(
      [
        [2025, 3, 20],
        [2026, 3, 5],
        [2027, 2, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.hanukkah,
    inYearWindow([
      { year: 2025, month: 11, day: 15, duration: 8 },
      { year: 2026, month: 11, day: 5, duration: 8 },
      { year: 2027, month: 11, day: 25, duration: 8 },
    ]),
  ],
  [HOLIDAY_TAGLINES.halloween, onMonthDay(9, 31)],
  [HOLIDAY_TAGLINES.thanksgiving, isFourthThursdayOfNovember],
  [HOLIDAY_TAGLINES.valentines, onMonthDay(1, 14)],
  [HOLIDAY_TAGLINES.christmas, onMonthDay(11, 25)],
]);

function isTaglineActive(tagline: string, date: Date): boolean {
  const rule = HOLIDAY_RULES.get(tagline);
  if (!rule) {
    return true;
  }
  return rule(date);
}

export interface TaglineOptions {
  env?: NodeJS.ProcessEnv;
  random?: () => number;
  now?: () => Date;
  mode?: TaglineMode;
}

export function activeTaglines(options: TaglineOptions = {}): string[] {
  if (TAGLINES.length === 0) {
    return [DEFAULT_TAGLINE];
  }
  const today = options.now ? options.now() : new Date();
  const filtered = TAGLINES.filter((tagline) => isTaglineActive(tagline, today));
  return filtered.length > 0 ? filtered : TAGLINES;
}

export function pickTagline(options: TaglineOptions = {}): string {
  if (options.mode === "off") {
    return "";
  }
  if (options.mode === "default") {
    return DEFAULT_TAGLINE;
  }
  const env = options.env ?? process.env;
  const override = env?.OPENCLAW_TAGLINE_INDEX;
  if (override !== undefined) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const pool = TAGLINES.length > 0 ? TAGLINES : [DEFAULT_TAGLINE];
      return pool[parsed % pool.length];
    }
  }
  const pool = activeTaglines(options);
  const rand = options.random ?? Math.random;
  const index = Math.floor(rand() * pool.length) % pool.length;
  return pool[index];
}

export { TAGLINES, HOLIDAY_RULES, DEFAULT_TAGLINE };
