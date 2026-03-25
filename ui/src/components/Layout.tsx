import {
  LayoutDashboard,
  TrendingUp,
  Settings,
  Shield,
  FileJson,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";
import { DailyPnlBar } from "./DailyPnlBar";
import { KillSwitchButton } from "./KillSwitchButton";
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
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, end: true },
    ],
  },
  {
    title: "Trading",
    items: [
      { to: "/trading", label: "Trading Hub", icon: <TrendingUp className="w-4 h-4" />, end: true },
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
      { to: "/trading/settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/channels", label: "Channels", icon: <MessageSquare className="w-4 h-4" /> },
      { to: "/security", label: "Security", icon: <Shield className="w-4 h-4" /> },
      { to: "/config", label: "Config", icon: <FileJson className="w-4 h-4" /> },
    ],
  },
];

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-[var(--glass-border)] text-neutral-100 shadow-sm shadow-black/30 border border-[var(--glass-active-border)]"
            : "text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] hover:shadow-sm",
        )
      }
    >
      <span className={cn("shrink-0 transition-transform duration-200", collapsed && "scale-125")}>
        {item.icon}
      </span>
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 border-r border-[var(--glass-chrome-border)] bg-[var(--glass-sidebar)] backdrop-blur-2xl transition-all duration-300",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "h-14 flex items-center border-b border-[var(--glass-chrome-border)] shrink-0",
          collapsed ? "justify-center" : "px-3",
        )}
      >
        <NavLink to="/" className="flex items-center tracking-tight">
          <span className="text-lg font-bold text-orange-500">{collapsed ? "T" : "Tiger"}</span>
          <span className="text-lg font-bold text-neutral-100">{collapsed ? "P" : "Paw"}</span>
        </NavLink>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                {group.title}
              </div>
            )}
            {collapsed && <Separator className="mb-2" />}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-[var(--glass-chrome-border)] shrink-0">
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center py-2 rounded-md bg-[var(--glass-subtle)] border border-[var(--glass-border)] text-neutral-500 hover:text-neutral-300 hover:bg-[var(--glass-subtle-hover)] hover:border-[var(--glass-border-hover)] cursor-pointer transition-all duration-200",
            collapsed ? "justify-center" : "px-3 gap-2",
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-xs">Compact</span>}
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 text-neutral-400 hover:text-neutral-200"
      >
        <Menu className="w-5 h-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="p-4 border-b border-[var(--glass-subtle-hover)]">
            <SheetTitle>
              <span className="text-orange-500">Tiger</span>
              <span className="text-neutral-100">Paw</span>
            </SheetTitle>
            <SheetDescription className="sr-only">Navigation menu</SheetDescription>
          </SheetHeader>
          <nav className="py-3 px-2 space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  {group.title}
                </div>
                <div className="space-y-0.5">
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
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const theme = useThemeStore((s) => s.theme);

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

            {/* Tagline — desktop only */}
            <span className="hidden md:block text-sm text-neutral-500 font-medium tracking-wide">
              Multi-Platform Trading Partner
            </span>

            {/* Right side: Notifications + Kill Switch + PnL */}
            <div className="ml-auto flex items-center gap-4">
              <DailyPnlBar />
              <NotificationBell />
              <KillSwitchButton />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
