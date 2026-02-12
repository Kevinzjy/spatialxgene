/**
 * Color scales for spatial scatter: continuous (gene) and categorical (annotation).
 * Continuous palettes mirror matplotlib/seaborn built-in colormaps (vlag, viridis, etc.).
 */

// Categorical palette (distinct, colorblind-friendly-ish)
const CAT_COLORS = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5",
  "#c49c94", "#f7b6d2", "#c7c7c7", "#dbdb8d", "#9edae5",
];

export function getCategoricalColors(labels: string[]): Map<string, string> {
  const uniq = [...new Set(labels)];
  const m = new Map<string, string>();
  uniq.forEach((l, i) => m.set(l, CAT_COLORS[i % CAT_COLORS.length]));
  return m;
}

// --- Continuous palettes (gene expression) ---
// Each entry: [position in 0..1, r, g, b] in 0..1. Interpolation is linear between stops.
type ColorStop = [number, number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function stopsFromHex(positions: number[], hexes: string[]): ColorStop[] {
  return positions.map((p, i) => [p, ...hexToRgb(hexes[i])]);
}

// vlag-like: blue -> white -> red (seaborn diverging, default)
const VLAG_STOPS: ColorStop[] = [
  [0, 0.2, 0.4, 0.8],
  [0.25, 0.3, 0.6, 0.9],
  [0.5, 0.9, 0.9, 0.9],
  [0.75, 0.9, 0.5, 0.3],
  [1, 0.8, 0.2, 0.2],
];

// Matplotlib perceptually uniform sequential (approximate hex samples)
const VIRIDIS = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"]
);
const PLASMA = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"]
);
const INFERNO = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#000004", "#781286", "#bb3754", "#ed6825", "#fbbc2a"]
);
const MAGMA = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fcfdbf"]
);
const CIVIDIS = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#00224e", "#123570", "#3b496c", "#575d6d", "#fdea45"]
);

// Matplotlib diverging
const COOLWARM = stopsFromHex(
  [0, 0.5, 1],
  ["#3b4cc0", "#ffffff", "#b4042e"]
);
const RDBU = stopsFromHex(
  [0, 0.5, 1],
  ["#b4042e", "#ffffff", "#3b4cc0"]
);
const BRBG = stopsFromHex(
  [0, 0.5, 1],
  ["#543005", "#f5f5f5", "#003c30"]
);
const RDYLBU = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#d73027", "#fc8d59", "#ffffbf", "#91bfdb", "#4575b4"]
);

// Sequential (single-hue or multi)
const BLUES = stopsFromHex(
  [0, 0.5, 1],
  ["#08306b", "#6baed6", "#f7fbff"]
);
const GREENS = stopsFromHex(
  [0, 0.5, 1],
  ["#00441b", "#66c2a4", "#f7fcf5"]
);
const ORANGES = stopsFromHex(
  [0, 0.5, 1],
  ["#7f2704", "#fdae6b", "#fff5eb"]
);
const PURPLES = stopsFromHex(
  [0, 0.5, 1],
  ["#3f007d", "#9e9ac8", "#fcfbfd"]
);
const YLORRD = stopsFromHex(
  [0, 0.5, 1],
  ["#800026", "#fc4e2a", "#ffffcc"]
);
const HOT = stopsFromHex(
  [0, 0.33, 0.66, 1],
  ["#000000", "#800000", "#ffff00", "#ffffff"]
);
const GRAY = stopsFromHex(
  [0, 0.5, 1],
  ["#000000", "#808080", "#ffffff"]
);

const CONTINUOUS_PALETTES: Record<string, ColorStop[]> = {
  vlag: VLAG_STOPS,
  viridis: VIRIDIS,
  plasma: PLASMA,
  inferno: INFERNO,
  magma: MAGMA,
  cividis: CIVIDIS,
  coolwarm: COOLWARM,
  RdBu: RDBU,
  BrBG: BRBG,
  RdYlBu: RDYLBU,
  Blues: BLUES,
  Greens: GREENS,
  Oranges: ORANGES,
  Purples: PURPLES,
  YlOrRd: YLORRD,
  hot: HOT,
  gray: GRAY,
};

/** Default continuous palette (gene expression). Same as seaborn vlag-style. */
export const DEFAULT_CONTINUOUS_PALETTE = "vlag";

/** Ordered list of continuous palette ids for UI. */
export const CONTINUOUS_PALETTE_IDS = Object.keys(CONTINUOUS_PALETTES);

/**
 * Returns a CSS linear-gradient string for the palette (for use as background).
 * Useful to show a color bar preview in the UI.
 * @param reverse - if true, gradient direction is reversed (like vlag_r).
 */
export function getPaletteGradientCss(paletteId: string, reverse = false): string {
  const stops = CONTINUOUS_PALETTES[paletteId] ?? VLAG_STOPS;
  const mapped = reverse
    ? [...stops].map(([pos, r, g, b]) => [1 - pos, r, g, b] as [number, number, number, number]).sort((a, b) => a[0] - b[0])
    : stops;
  const parts = mapped.map(([pos, r, g, b]) => {
    const rr = Math.round(r * 255);
    const gg = Math.round(g * 255);
    const bb = Math.round(b * 255);
    return `rgb(${rr},${gg},${bb}) ${pos * 100}%`;
  });
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/** Human-readable labels; id is used when label is missing. */
export const CONTINUOUS_PALETTE_LABELS: Record<string, string> = {
  vlag: "vlag",
  viridis: "viridis",
  plasma: "plasma",
  inferno: "inferno",
  magma: "magma",
  cividis: "cividis",
  coolwarm: "coolwarm",
  RdBu: "RdBu",
  BrBG: "BrBG",
  RdYlBu: "RdYlBu",
  Blues: "Blues",
  Greens: "Greens",
  Oranges: "Oranges",
  Purples: "Purples",
  YlOrRd: "YlOrRd",
  hot: "hot",
  gray: "gray",
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Map value in [vmin, vmax] to RGB using the given continuous palette.
 * @param paletteId - key from CONTINUOUS_PALETTES; falls back to vlag if unknown.
 * @param reverse - if true, map high values to low end of palette (like vlag_r).
 */
export function continuousToRgb(
  value: number,
  vmin: number,
  vmax: number,
  paletteId: string = DEFAULT_CONTINUOUS_PALETTE,
  reverse = false
): [number, number, number] {
  const stops = CONTINUOUS_PALETTES[paletteId] ?? VLAG_STOPS;
  if (vmax <= vmin || !Number.isFinite(value)) {
    const [, r, g, b] = stops[0];
    return [r * 255, g * 255, b * 255];
  }
  let t = Math.max(0, Math.min(1, (value - vmin) / (vmax - vmin)));
  if (reverse) t = 1 - t;
  let i = 0;
  while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
  const [p0, r0, g0, b0] = stops[i];
  const [p1, r1, g1, b1] = stops[i + 1];
  const s = (t - p0) / (p1 - p0);
  return [
    Math.round(lerp(r0, r1, s) * 255),
    Math.round(lerp(g0, g1, s) * 255),
    Math.round(lerp(b0, b1, s) * 255),
  ];
}
