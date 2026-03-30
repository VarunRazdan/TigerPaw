import {
  LayoutDashboard,
  TrendingUp,
  Settings,
  Shield,
  FileJson,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  Bot,
  Inbox,
  Workflow,
  Plug,
  Cpu,
  Blocks,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { useGatewayConfig } from "@/hooks/use-gateway-config";
import { useTradingEvents } from "@/hooks/use-trading-events";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useThemeStore } from "@/stores/theme-store";
import { DailyPnlBar } from "./DailyPnlBar";
import { KillSwitchButton } from "./KillSwitchButton";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationBell } from "./TradingNotificationToast";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";

function PlatformIcon({ name, className }: { name: string; className?: string }) {
  return <img src={`/icons/trading-platforms/${name}.svg`} alt="" className={className} />;
}

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
};

type NavGroup = {
  key: string;
  title: string;
  items: NavItem[];
  collapsible?: boolean;
};

function useNavGroups(): NavGroup[] {
  const { t } = useTranslation("common");
  const tradingEnabled = useAppStore((s) => s.tradingEnabled);

  const groups: NavGroup[] = [
    {
      key: "overview",
      title: t("nav.overview", "Overview"),
      items: [
        {
          to: "/",
          label: t("nav.dashboard", "Dashboard"),
          icon: <LayoutDashboard className="w-4 h-4" />,
          end: true,
        },
        {
          to: "/message-hub",
          label: t("nav.messageHub", "Message Hub"),
          icon: <Inbox className="w-4 h-4" />,
        },
        {
          to: "/assistant",
          label: t("nav.assistant", "Assistant"),
          icon: <Bot className="w-4 h-4" />,
        },
      ],
    },
  ];

  if (tradingEnabled) {
    groups.push({
      key: "trading",
      title: t("nav.trading", "Trading"),
      collapsible: true,
      items: [
        {
          to: "/trading",
          label: t("nav.tradingHub", "Trading Hub"),
          icon: <TrendingUp className="w-4 h-4" />,
          end: true,
        },
        {
          to: "/trading/alpaca",
          label: "Alpaca",
          icon: <PlatformIcon name="alpaca" className="w-4 h-4" />,
        },
        {
          to: "/trading/polymarket",
          label: "Polymarket",
          icon: <PlatformIcon name="polymarket" className="w-4 h-4" />,
        },
        {
          to: "/trading/kalshi",
          label: "Kalshi",
          icon: <PlatformIcon name="kalshi" className="w-4 h-4" />,
        },
        {
          to: "/trading/manifold",
          label: "Manifold",
          icon: <PlatformIcon name="manifold" className="w-4 h-4" />,
        },
        {
          to: "/trading/coinbase",
          label: "Coinbase",
          icon: <PlatformIcon name="coinbase" className="w-4 h-4" />,
        },
        {
          to: "/trading/ibkr",
          label: "IBKR",
          icon: <PlatformIcon name="interactive-brokers" className="w-4 h-4" />,
        },
        {
          to: "/trading/binance",
          label: "Binance",
          icon: <PlatformIcon name="binance" className="w-4 h-4" />,
        },
        {
          to: "/trading/kraken",
          label: "Kraken",
          icon: <PlatformIcon name="kraken" className="w-4 h-4" />,
        },
        {
          to: "/trading/dydx",
          label: "dYdX",
          icon: <PlatformIcon name="dydx" className="w-4 h-4" />,
        },
        {
          to: "/trading/settings",
          label: t("nav.settings", "Settings"),
          icon: <Settings className="w-4 h-4" />,
        },
      ],
    });
  }

  groups.push({
    key: "integrations",
    title: t("nav.integrations", "Integrations"),
    items: [
      {
        to: "/integrations",
        label: t("nav.integrationsHub", "Integrations"),
        icon: <Blocks className="w-4 h-4" />,
        end: true,
      },
    ],
  });

  groups.push({
    key: "system",
    title: t("nav.system", "System"),
    collapsible: true,
    items: [
      {
        to: "/channels",
        label: t("nav.channels", "Agent Channels"),
        icon: <MessageSquare className="w-4 h-4" />,
      },
      {
        to: "/security",
        label: t("nav.security", "Security"),
        icon: <Shield className="w-4 h-4" />,
      },
      { to: "/config", label: t("nav.config", "Config"), icon: <FileJson className="w-4 h-4" /> },
      {
        to: "/workflows",
        label: t("nav.workflows", "Workflows"),
        icon: <Workflow className="w-4 h-4" />,
      },
      {
        to: "/mcp",
        label: t("nav.mcp", "MCP"),
        icon: <Plug className="w-4 h-4" />,
      },
      {
        to: "/models",
        label: t("nav.models", "Models"),
        icon: <Cpu className="w-4 h-4" />,
      },
    ],
  });

  return groups;
}

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-300 ease-in-out overflow-hidden",
          collapsed && "justify-center px-2 gap-0",
          isActive
            ? "bg-[var(--glass-border)] text-neutral-100 shadow-sm shadow-black/30 border border-[var(--glass-active-border)]"
            : "text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] hover:shadow-sm",
        )
      }
    >
      <span
        className={cn(
          "shrink-0 transition-transform duration-300 ease-in-out",
          collapsed && "scale-110",
        )}
      >
        {item.icon}
      </span>
      <span
        className={cn(
          "whitespace-nowrap transition-all duration-300 ease-in-out",
          collapsed ? "w-0 opacity-0 overflow-hidden" : "w-auto opacity-100",
        )}
      >
        {item.label}
      </span>
    </NavLink>
  );
}

function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation("common");
  const navGroups = useNavGroups();
  const scrollRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Collapsible group state — persisted in localStorage
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("tp-sidebar-groups");
      if (stored) {
        return JSON.parse(stored) as Record<string, boolean>;
      }
    } catch {
      /* ignore */
    }
    return { trading: true, system: true };
  });

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("tp-sidebar-groups", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      setHasOverflow(el.scrollHeight > el.clientHeight + 4);
    }
  }, []);

  useEffect(() => {
    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [checkOverflow, navGroups]);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 border-r rtl:border-r-0 rtl:border-l border-[var(--glass-chrome-border)] bg-[var(--glass-sidebar)] backdrop-blur-2xl transition-all duration-300",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "h-14 flex items-center border-b border-[var(--glass-chrome-border)] shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
          collapsed ? "justify-center" : "px-3",
        )}
      >
        <NavLink to="/" className="flex items-center tracking-tight overflow-hidden">
          <span className="text-lg font-bold text-orange-500 shrink-0">T</span>
          <span
            className={cn(
              "text-lg font-bold text-orange-500 transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden",
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
            )}
          >
            iger
          </span>
          <span className="text-lg font-bold text-neutral-100 shrink-0">P</span>
          <span
            className={cn(
              "text-lg font-bold text-neutral-100 transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden",
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
            )}
          >
            aw
          </span>
        </NavLink>
      </div>

      {/* Nav groups — scrollable with visible scrollbar */}
      <div
        ref={wrapperRef}
        className={cn("sidebar-scroll-wrapper flex-1 min-h-0", hasOverflow && "has-overflow")}
      >
        <nav
          ref={scrollRef}
          onScroll={checkOverflow}
          className={cn("sidebar-scroll h-full py-3 px-2 space-y-4", !hasOverflow && "no-overflow")}
        >
          {navGroups.map((group) => {
            const isGroupCollapsed = group.collapsible && collapsedGroups[group.key];
            return (
              <div key={group.key}>
                {/* Expanded: text title (clickable when collapsible) */}
                {!collapsed &&
                  (group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600 hover:text-neutral-400 transition-colors duration-200 cursor-pointer"
                    >
                      <span>{group.title}</span>
                      <ChevronDown
                        className={cn(
                          "w-3 h-3 transition-transform duration-200",
                          isGroupCollapsed && "-rotate-90",
                        )}
                      />
                    </button>
                  ) : (
                    <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                      {group.title}
                    </div>
                  ))}
                {/* Compact: separator line (clickable when collapsible) */}
                {collapsed &&
                  (group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-center mb-2 py-1 cursor-pointer group"
                    >
                      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-neutral-800/60 group-hover:bg-neutral-700 border border-neutral-700/50 group-hover:border-neutral-600 transition-all duration-200">
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-200 transition-all duration-200",
                            isGroupCollapsed && "-rotate-90",
                          )}
                        />
                      </div>
                    </button>
                  ) : (
                    <div className="mb-2">
                      <Separator />
                    </div>
                  ))}
                {/* Items — animated collapse in both modes */}
                <div
                  className={cn(
                    "space-y-0.5 transition-all duration-200 ease-in-out overflow-hidden",
                    isGroupCollapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100",
                  )}
                >
                  {group.items.map((item) => (
                    <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
                  ))}
                </div>
              </div>
            );
          })}
          {/* Bottom padding to keep last items above the fade gradient */}
          {hasOverflow && <div className="h-6" />}
        </nav>
      </div>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-[var(--glass-chrome-border)] shrink-0">
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center py-2 rounded-md bg-[var(--glass-subtle)] border border-[var(--glass-border)] text-neutral-500 hover:text-neutral-300 hover:bg-[var(--glass-subtle-hover)] hover:border-[var(--glass-border-hover)] cursor-pointer transition-all duration-300 ease-in-out overflow-hidden",
            collapsed ? "justify-center" : "px-3 gap-2",
          )}
        >
          <span className="shrink-0 transition-transform duration-300 ease-in-out rtl:rotate-180">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </span>
          <span
            className={cn(
              "text-xs whitespace-nowrap transition-all duration-300 ease-in-out",
              collapsed ? "w-0 opacity-0 overflow-hidden" : "w-auto opacity-100",
            )}
          >
            {t("nav.compact")}
          </span>
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  const { t } = useTranslation("common");
  const navGroups = useNavGroups();
  const [open, setOpen] = useState(false);

  // Share the same localStorage-persisted collapsed state as desktop
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("tp-sidebar-groups");
      if (stored) {
        return JSON.parse(stored) as Record<string, boolean>;
      }
    } catch {
      /* ignore */
    }
    return { trading: true, system: true };
  });

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("tp-sidebar-groups", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-pointer transition-all duration-200"
      >
        <Menu className="w-5 h-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-[var(--glass-subtle-hover)] shrink-0">
            <SheetTitle>
              <span className="text-orange-500">Tiger</span>
              <span className="text-neutral-100">Paw</span>
            </SheetTitle>
            <SheetDescription className="sr-only">{t("nav.menuLabel")}</SheetDescription>
          </SheetHeader>
          <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2 space-y-4">
            {navGroups.map((group) => {
              const isGroupCollapsed = group.collapsible && collapsedGroups[group.key];
              return (
                <div key={group.key}>
                  {group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600 hover:text-neutral-400 transition-colors duration-200 cursor-pointer"
                    >
                      <span>{group.title}</span>
                      <ChevronDown
                        className={cn(
                          "w-3 h-3 transition-transform duration-200",
                          isGroupCollapsed && "-rotate-90",
                        )}
                      />
                    </button>
                  ) : (
                    <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                      {group.title}
                    </div>
                  )}
                  <div
                    className={cn(
                      "space-y-0.5 transition-all duration-200 ease-in-out overflow-hidden",
                      isGroupCollapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100",
                    )}
                  >
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                            isActive
                              ? "bg-neutral-800 text-neutral-100"
                              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50",
                          )
                        }
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function Layout() {
  const { t } = useTranslation("common");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const tradingEnabled = useAppStore((s) => s.tradingEnabled);
  useGatewayConfig();
  useTradingEvents();

  // Apply theme to document root so CSS [data-theme] selectors activate
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "tiger-gold") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  return (
    <div className="min-h-screen flex bg-transparent relative z-[1]">
      {/* Desktop sidebar */}
      <SidebarNav
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-[var(--glass-chrome-border)] bg-[var(--glass-header)] backdrop-blur-2xl sticky top-0 z-40">
          <div className="px-4 h-14 flex items-center gap-4">
            <MobileNav />

            {/* Mobile logo */}
            <NavLink to="/" className="md:hidden flex items-center">
              <span className="text-lg font-bold text-orange-500">Tiger</span>
              <span className="text-lg font-bold text-neutral-100">Paw</span>
            </NavLink>

            {/* Tagline — desktop only, hidden until lg to avoid overflow with sidebar */}
            <span className="hidden lg:block text-sm text-neutral-500 font-medium tracking-wide truncate">
              {t("nav.tagline")}
            </span>

            {/* Right side: Notifications + Kill Switch + PnL */}
            <div className="ml-auto rtl:ml-0 rtl:mr-auto flex items-center gap-4">
              {tradingEnabled && <DailyPnlBar />}
              <div className="flex items-center gap-1.5">
                <LanguageSwitcher />
                <NotificationBell />
              </div>
              {tradingEnabled && <KillSwitchButton />}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-neutral-600">
                  Loading...
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
