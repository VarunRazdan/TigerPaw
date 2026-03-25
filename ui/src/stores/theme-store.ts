import { create } from "zustand";

export type ThemeId = "tiger-gold" | "midnight-steel";

type ThemeInfo = {
  id: ThemeId;
  label: string;
  description: string;
  bodyBg: string;
  chartBg: string;
  chartToolbar: string;
};

export const THEMES: Record<ThemeId, ThemeInfo> = {
  "tiger-gold": {
    id: "tiger-gold",
    label: "Tiger Gold",
    description: "Warm amber orbs with tiger-stripe texture",
    bodyBg: "#0a0908",
    chartBg: "rgba(10, 9, 8, 1)",
    chartToolbar: "#0a0908",
  },
  "midnight-steel": {
    id: "midnight-steel",
    label: "Midnight Steel",
    description: "Cool neutral glass on dark grey",
    bodyBg: "#1B1B1F",
    chartBg: "rgba(27, 27, 31, 1)",
    chartToolbar: "#1B1B1F",
  },
};

type ThemeState = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem("tigerpaw-theme") as ThemeId) ?? "tiger-gold",
  setTheme: (id) => {
    localStorage.setItem("tigerpaw-theme", id);
    set({ theme: id });
  },
}));
