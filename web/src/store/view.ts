// Transient view state shared by the drawing and the lists (not saved).
import { create } from 'zustand';

export type ActiveKind = 'sheets' | 'linear';

interface ViewState {
  activeKind: ActiveKind;
  /** Index into plan.sheets. */
  sheet: number;
  /** Cut number highlighted on the drawing. */
  activeCut: number | null;
  /** Index into linearResult.plan.bars. */
  bar: number;
  /** Cut number highlighted on the bar drawing. */
  activeLinearCut: number | null;
  showLabels: boolean;
  showCuts: boolean;
  showSizes: boolean;
  showEdges: boolean;
  zoom: number;
  setActiveKind(kind: ActiveKind): void;
  setSheet(i: number): void;
  setActiveCut(n: number | null): void;
  setBar(i: number): void;
  setActiveLinearCut(n: number | null): void;
  toggle(key: 'showLabels' | 'showCuts' | 'showSizes' | 'showEdges'): void;
  setZoom(z: number): void;
}

export const useView = create<ViewState>()((set) => ({
  activeKind: 'sheets',
  sheet: 0,
  activeCut: null,
  bar: 0,
  activeLinearCut: null,
  showLabels: true,
  showCuts: true,
  showSizes: true,
  showEdges: false,
  zoom: 1,
  setActiveKind: (activeKind) => set({ activeKind }),
  setSheet: (sheet) => set({ sheet, activeCut: null }),
  setActiveCut: (activeCut) => set({ activeCut }),
  setBar: (bar) => set({ bar, activeLinearCut: null }),
  setActiveLinearCut: (activeLinearCut) => set({ activeLinearCut }),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(1, zoom)) }),
}));
