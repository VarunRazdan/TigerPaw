import { create } from "zustand";

function readLocalFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === "true";
  } catch {
    return false;
  }
}

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
  onboardingComplete: boolean;
  chartsEnabled: boolean;
  setTradingEnabled: (enabled: boolean) => void;
  setConfigLoaded: () => void;
  setChannelStatuses: (statuses: ChannelStatus[]) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setChartsEnabled: (enabled: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  tradingEnabled: true,
  configLoaded: false,
  channelStatuses: null,
  onboardingComplete: readLocalFlag("tigerpaw-onboarding-complete"),
  chartsEnabled: (() => {
    try {
      return globalThis.localStorage?.getItem("tigerpaw-charts-enabled") !== "false";
    } catch {
      return true;
    }
  })(),
  setTradingEnabled: (enabled) => set({ tradingEnabled: enabled }),
  setConfigLoaded: () => set({ configLoaded: true }),
  setChannelStatuses: (statuses) => set({ channelStatuses: statuses }),
  setOnboardingComplete: (complete) => {
    localStorage.setItem("tigerpaw-onboarding-complete", String(complete));
    set({ onboardingComplete: complete });
  },
  setChartsEnabled: (enabled) => {
    localStorage.setItem("tigerpaw-charts-enabled", String(enabled));
    set({ chartsEnabled: enabled });
  },
}));
