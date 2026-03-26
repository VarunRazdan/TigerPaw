import { create } from "zustand";

type AppState = {
  tradingEnabled: boolean;
  configLoaded: boolean;
  setTradingEnabled: (enabled: boolean) => void;
  setConfigLoaded: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  tradingEnabled: true,
  configLoaded: false,
  setTradingEnabled: (enabled) => set({ tradingEnabled: enabled }),
  setConfigLoaded: () => set({ configLoaded: true }),
}));
