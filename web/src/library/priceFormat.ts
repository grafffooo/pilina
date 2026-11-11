// Prices converted to feet carry long fractions: compare and show them rounded.
export const exact = (v: number) => Math.round(v * 1e6) / 1e6;
export const formatPrice = (v: number) => String(Math.round(v * 1e4) / 1e4);
