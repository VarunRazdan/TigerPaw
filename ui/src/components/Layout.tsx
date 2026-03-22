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
  LineChart,
  BarChart3,
  Landmark,
  Coins,
  Bitcoin,
  Building2,
  Hexagon,
  CircleDollarSign,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DailyPnlBar } from "./DailyPnlBar";
import { KillSwitchButton } from "./KillSwitchButton";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";

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
      { to: "/trading/alpaca", label: "Alpaca", icon: <LineChart className="w-4 h-4" /> },
      { to: "/trading/polymarket", label: "Polymarket", icon: <BarChart3 className="w-4 h-4" /> },
      { to: "/trading/kalshi", label: "Kalshi", icon: <Landmark className="w-4 h-4" /> },
      { to: "/trading/manifold", label: "Manifold", icon: <Coins className="w-4 h-4" /> },
      { to: "/trading/coinbase", label: "Coinbase", icon: <Bitcoin className="w-4 h-4" /> },
      { to: "/trading/ibkr", label: "IBKR", icon: <Building2 className="w-4 h-4" /> },
      { to: "/trading/binance", label: "Binance", icon: <Hexagon className="w-4 h-4" /> },
      { to: "/trading/kraken", label: "Kraken", icon: <CircleDollarSign className="w-4 h-4" /> },
      { to: "/trading/dydx", label: "dYdX", icon: <Layers className="w-4 h-4" /> },
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
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-neutral-800 text-neutral-100"
            : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50",
        )
      }
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-neutral-800 bg-neutral-900/50 transition-all duration-200",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-3 border-b border-neutral-800 shrink-0">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="text-lg font-bold text-orange-500">T</span>
          {!collapsed && (
            <>
              <span className="text-lg font-bold text-orange-500">iger</span>
              <span className="text-lg font-bold text-neutral-100">paw</span>
            </>
          )}
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
      <div className="p-2 border-t border-neutral-800">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
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
          <SheetHeader className="p-4 border-b border-neutral-800">
            <SheetTitle>
              <span className="text-orange-500">Tiger</span>
              <span className="text-neutral-100">paw</span>
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

  return (
    <div className="min-h-screen flex bg-neutral-950">
      {/* Desktop sidebar */}
      <SidebarNav
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="px-4 h-14 flex items-center gap-4">
            <MobileNav />

            {/* Mobile logo */}
            <NavLink to="/" className="md:hidden flex items-center gap-1">
              <span className="text-lg font-bold text-orange-500">Tiger</span>
              <span className="text-lg font-bold text-neutral-100">paw</span>
            </NavLink>

            {/* Right side: Kill Switch + PnL */}
            <div className="ml-auto flex items-center gap-4">
              <DailyPnlBar />
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
