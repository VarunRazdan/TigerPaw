import { lazy, useMemo } from "react";
import { createHashRouter, Navigate, type RouteObject, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastNotifications } from "./components/ToastNotifications";
import { useAppStore } from "./stores/app-store";

// Lazy-loaded page components — each gets its own chunk
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const MessageHubPage = lazy(() =>
  import("./pages/MessageHubPage").then((m) => ({ default: m.MessageHubPage })),
);
const AssistantPage = lazy(() =>
  import("./pages/AssistantPage").then((m) => ({ default: m.AssistantPage })),
);
const ChannelsPage = lazy(() =>
  import("./pages/ChannelsPage").then((m) => ({ default: m.ChannelsPage })),
);
const SecurityPage = lazy(() =>
  import("./pages/SecurityPage").then((m) => ({ default: m.SecurityPage })),
);
const ConfigPage = lazy(() =>
  import("./pages/ConfigPage").then((m) => ({ default: m.ConfigPage })),
);
const WorkflowsPage = lazy(() =>
  import("./pages/WorkflowsPage").then((m) => ({ default: m.WorkflowsPage })),
);
const WorkflowEditorPage = lazy(() =>
  import("./pages/WorkflowEditorPage").then((m) => ({ default: m.WorkflowEditorPage })),
);
const McpPage = lazy(() => import("./pages/McpPage").then((m) => ({ default: m.McpPage })));
const ModelsPage = lazy(() =>
  import("./pages/ModelsPage").then((m) => ({ default: m.ModelsPage })),
);
const TradingPage = lazy(() =>
  import("./pages/TradingPage").then((m) => ({ default: m.TradingPage })),
);
const TradingSettingsPage = lazy(() =>
  import("./pages/TradingSettingsPage").then((m) => ({ default: m.TradingSettingsPage })),
);
const AlpacaPage = lazy(() =>
  import("./pages/AlpacaPage").then((m) => ({ default: m.AlpacaPage })),
);
const PolymarketPage = lazy(() =>
  import("./pages/PolymarketPage").then((m) => ({ default: m.PolymarketPage })),
);
const KalshiPage = lazy(() =>
  import("./pages/KalshiPage").then((m) => ({ default: m.KalshiPage })),
);
const ManifoldPage = lazy(() =>
  import("./pages/ManifoldPage").then((m) => ({ default: m.ManifoldPage })),
);
const CoinbasePage = lazy(() =>
  import("./pages/CoinbasePage").then((m) => ({ default: m.CoinbasePage })),
);
const IbkrPage = lazy(() => import("./pages/IbkrPage").then((m) => ({ default: m.IbkrPage })));
const BinancePage = lazy(() =>
  import("./pages/BinancePage").then((m) => ({ default: m.BinancePage })),
);
const KrakenPage = lazy(() =>
  import("./pages/KrakenPage").then((m) => ({ default: m.KrakenPage })),
);
const DydxPage = lazy(() => import("./pages/DydxPage").then((m) => ({ default: m.DydxPage })));

const TRADING_ROUTES: RouteObject[] = [
  { path: "trading", element: <TradingPage /> },
  { path: "trading/settings", element: <TradingSettingsPage /> },
  { path: "trading/alpaca", element: <AlpacaPage /> },
  { path: "trading/polymarket", element: <PolymarketPage /> },
  { path: "trading/kalshi", element: <KalshiPage /> },
  { path: "trading/manifold", element: <ManifoldPage /> },
  { path: "trading/coinbase", element: <CoinbasePage /> },
  { path: "trading/ibkr", element: <IbkrPage /> },
  { path: "trading/binance", element: <BinancePage /> },
  { path: "trading/kraken", element: <KrakenPage /> },
  { path: "trading/dydx", element: <DydxPage /> },
];

const TRADING_REDIRECT: RouteObject = {
  path: "trading/*",
  element: <Navigate to="/" replace />,
};

const CORE_ROUTES: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: "message-hub", element: <MessageHubPage /> },
  { path: "inbox", element: <Navigate to="/message-hub" replace /> },
  { path: "assistant", element: <AssistantPage /> },
  { path: "channels", element: <ChannelsPage /> },
  { path: "security", element: <SecurityPage /> },
  { path: "config", element: <ConfigPage /> },
  { path: "workflows", element: <WorkflowsPage /> },
  { path: "workflows/:id", element: <WorkflowEditorPage /> },
  { path: "mcp", element: <McpPage /> },
  { path: "models", element: <ModelsPage /> },
];

export function App() {
  const tradingEnabled = useAppStore((s) => s.tradingEnabled);

  const router = useMemo(
    () =>
      createHashRouter([
        {
          path: "/",
          element: <Layout />,
          children: [...CORE_ROUTES, ...(tradingEnabled ? TRADING_ROUTES : [TRADING_REDIRECT])],
        },
      ]),
    [tradingEnabled],
  );

  return (
    <>
      <RouterProvider router={router} />
      <ToastNotifications />
    </>
  );
}
