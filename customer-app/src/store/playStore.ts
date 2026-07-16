import { create } from "zustand";
import type { CampaignDisplay, PlayResult } from "../types";

export type Step =
  | "landing"
  | "register"
  | "scratch"
  | "revealed"
  | "blocked";

interface PlayState {
  display: CampaignDisplay | null;
  result: PlayResult | null;
  step: Step;
  customerName: string;
  setDisplay: (display: CampaignDisplay | null) => void;
  setResult: (result: PlayResult) => void;
  setStep: (step: Step) => void;
  setCustomerName: (name: string) => void;
  reset: () => void;
}

export const usePlayStore = create<PlayState>((set) => ({
  display: null,
  result: null,
  step: "landing",
  customerName: "",
  setDisplay: (display) => set({ display }),
  setResult: (result) =>
    set({
      result,
      step: result.status === "ok" ? "scratch" : "blocked",
    }),
  setStep: (step) => set({ step }),
  setCustomerName: (customerName) => set({ customerName }),
  reset: () =>
    set({ display: null, result: null, step: "landing", customerName: "" }),
}));
