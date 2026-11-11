// Transient view state shared by the drawing and the lists (not saved).
import { create } from 'zustand';

interface ViewState {
  /** Index into plan.sheets. */
  sheet: number;
  /** Cut number highlighted on the drawing. */
  activeCut: number | null;
  showLabels: boolean;
  showCuts: boolean;
  showSizes: boolean;
  showEdges: boolean;
  zoom: number;
  setSheet(i: number): void;
  setActiveCut(n: number | null): void;
  toggle(key: 'showLabels' | 'showCuts' | 'showSizes' | 'showEdges'): void;
  setZoom(z: number): void;
}

export const useView = create<ViewState>()((set) => ({
  sheet: 0,
  activeCut: null,
  showLabels: true,
  showCuts: true,
  showSizes: true,
  showEdges: false,
  zoom: 1,
  setSheet: (sheet) => set({ sheet, activeCut: null }),
  setActiveCut: (activeCut) => set({ activeCut }),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(1, zoom)) }),
}));
