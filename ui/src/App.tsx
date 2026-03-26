import { useMemo } from "react";
import { createHashRouter, Navigate, type RouteObject, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastNotifications } from "./components/ToastNotifications";
import { AlpacaPage } from "./pages/AlpacaPage";
import { AssistantPage } from "./pages/AssistantPage";
import { BinancePage } from "./pages/BinancePage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { CoinbasePage } from "./pages/CoinbasePage";
import { ConfigPage } from "./pages/ConfigPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DydxPage } from "./pages/DydxPage";
import { IbkrPage } from "./pages/IbkrPage";
import { InboxPage } from "./pages/InboxPage";
import { KalshiPage } from "./pages/KalshiPage";
import { KrakenPage } from "./pages/KrakenPage";
import { ManifoldPage } from "./pages/ManifoldPage";
import { McpPage } from "./pages/McpPage";
import { ModelsPage } from "./pages/ModelsPage";
import { PolymarketPage } from "./pages/PolymarketPage";
import { SecurityPage } from "./pages/SecurityPage";
import { TradingPage } from "./pages/TradingPage";
import { TradingSettingsPage } from "./pages/TradingSettingsPage";
import { WorkflowEditorPage } from "./pages/WorkflowEditorPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { useAppStore } from "./stores/app-store";

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
  { path: "inbox", element: <InboxPage /> },
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
