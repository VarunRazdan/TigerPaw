import { createHashRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AlpacaPage } from "./pages/AlpacaPage";
import { BinancePage } from "./pages/BinancePage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { CoinbasePage } from "./pages/CoinbasePage";
import { ConfigPage } from "./pages/ConfigPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DydxPage } from "./pages/DydxPage";
import { IbkrPage } from "./pages/IbkrPage";
import { KalshiPage } from "./pages/KalshiPage";
import { KrakenPage } from "./pages/KrakenPage";
import { ManifoldPage } from "./pages/ManifoldPage";
import { PolymarketPage } from "./pages/PolymarketPage";
import { SecurityPage } from "./pages/SecurityPage";
import { TradingPage } from "./pages/TradingPage";
import { TradingSettingsPage } from "./pages/TradingSettingsPage";

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
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
      { path: "channels", element: <ChannelsPage /> },
      { path: "security", element: <SecurityPage /> },
      { path: "config", element: <ConfigPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
