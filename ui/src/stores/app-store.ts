import { create } from "zustand";

type AppState = {
  tradingEnabled: boolean;
  configLoaded: boolean;
  gatewayOnline: boolean;
  gatewayConsecutiveFailures: number;
  setTradingEnabled: (enabled: boolean) => void;
  setConfigLoaded: () => void;
  resetConfigLoaded: () => void;
  setGatewayOnline: (online: boolean) => void;
  incrementGatewayFailures: () => void;
  resetGatewayFailures: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  tradingEnabled: true,
  configLoaded: false,
  gatewayOnline: true,
  gatewayConsecutiveFailures: 0,
  setTradingEnabled: (enabled) => set({ tradingEnabled: enabled }),
  setConfigLoaded: () => set({ configLoaded: true }),
  resetConfigLoaded: () => set({ configLoaded: false }),
  setGatewayOnline: (online) => set({ gatewayOnline: online }),
  incrementGatewayFailures: () =>
    set((s) => ({ gatewayConsecutiveFailures: s.gatewayConsecutiveFailures + 1 })),
  resetGatewayFailures: () => set({ gatewayConsecutiveFailures: 0 }),
}));
