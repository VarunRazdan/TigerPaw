import { create } from "zustand";

export type ChannelStatus = {
  id: string;
  label: string;
  enabled: boolean;
  connected: boolean;
};

type AppState = {
  tradingEnabled: boolean;
  configLoaded: boolean;
  channelStatuses: ChannelStatus[] | null;
  setTradingEnabled: (enabled: boolean) => void;
  setConfigLoaded: () => void;
  setChannelStatuses: (statuses: ChannelStatus[]) => void;
};

export const useAppStore = create<AppState>((set) => ({
  tradingEnabled: true,
  configLoaded: false,
  channelStatuses: null,
  setTradingEnabled: (enabled) => set({ tradingEnabled: enabled }),
  setConfigLoaded: () => set({ configLoaded: true }),
  setChannelStatuses: (statuses) => set({ channelStatuses: statuses }),
}));
