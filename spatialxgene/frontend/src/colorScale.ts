/**
 * Color scales for spatial scatter: continuous (gene) and categorical (annotation).
 * Continuous palettes mirror matplotlib/seaborn built-in colormaps (vlag, viridis, etc.).
 */

// Categorical palettes (distinct, colorblind-friendly-ish)
const CAT_PALETTES: Record<string, string[]> = {
  default: [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5",
    "#c49c94", "#f7b6d2", "#c7c7c7", "#dbdb8d", "#9edae5",
  ],
  pastel: [
    "#a6cee3", "#fb9a99", "#b2df8a", "#fdbf6f", "#cab2d6",
    "#ffff99", "#1f78b4", "#33a02c", "#e31a1c", "#ff7f00",
    "#6a3d9a", "#b15928", "#b3e2cd", "#fdcdac", "#cbd5e8",
    "#f4cae4", "#e6f5c9", "#fff2ae", "#f1e2cc", "#cccccc",
  ],
  // ColorBrewer-like sets for more variety
  Set1: [
    "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
    "#ffff33", "#a65628", "#f781bf", "#999999",
  ],
  Set2: [
    "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3",
    "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3",
  ],
  Dark2: [
    "#1b9e77", "#d95f02", "#7570b3", "#e7298a",
    "#66a61e", "#e6ab02", "#a6761d", "#666666",
  ],
  Paired: [
    "#a6cee3", "#1f78b4", "#b2df8a", "#33a02c",
    "#fb9a99", "#e31a1c", "#fdbf6f", "#ff7f00",
    "#cab2d6", "#6a3d9a", "#ffff99", "#b15928",
  ],
};

export const CATEGORICAL_PALETTE_IDS = Object.keys(CAT_PALETTES);

export const CATEGORICAL_PALETTE_LABELS: Record<string, string> = {
  default: "Default",
  pastel: "Pastel",
  Set1: "Set1",
  Set2: "Set2",
  Dark2: "Dark2",
  Paired: "Paired",
};

/** Categorical column is only shown as categories when 2 <= unique count <= this. */
export const ANNOTATION_MAX_CATEGORIES = 50;
/** Categorical column with fewer than this many unique values is treated as "too few" (show as nan in legend). */
export const ANNOTATION_MIN_CATEGORIES = 2;

/** Label shown in legend when column has too many distinct values for categorical. */
export const LABEL_NAN_TOO_MANY = "nan (too many categories)";
/** Label shown in legend when column has too few distinct values for categorical. */
export const LABEL_NAN_TOO_FEW = "nan (too few categories)";

const GRAY_FOR_NAN = "#888888";

export function getCategoricalColors(
  labels: string[],
  paletteId: string = "default",
  reverse = false
): Map<string, string> {
  let colors = CAT_PALETTES[paletteId] ?? CAT_PALETTES.default;
  if (reverse) {
    colors = [...colors].reverse();
  }
  const uniq = [...new Set(labels)];
  const m = new Map<string, string>();
  const isNaNLabel = (l: string) => {
    const s = String(l).trim().toLowerCase();
    return s === "nan" || s === "" || s === "none" || s === "null";
  };
  const isInvalidCategoryLabel = (l: string) =>
    l === LABEL_NAN_TOO_MANY || l === LABEL_NAN_TOO_FEW;
  const paletteLabels = uniq.filter((l) => !isNaNLabel(l) && !isInvalidCategoryLabel(l));
  const nanLabels = uniq.filter((l) => isNaNLabel(l));
  const invalidCategoryLabels = uniq.filter((l) => isInvalidCategoryLabel(l));
  paletteLabels.forEach((l, i) => m.set(l, colors[i % colors.length]));
  nanLabels.forEach((l) => m.set(l, "#d3d3d3"));
  invalidCategoryLabels.forEach((l) => m.set(l, GRAY_FOR_NAN));
  return m;
}

export function getCategoricalPaletteGradientCss(paletteId: string, reverse = false): string {
  const colors = CAT_PALETTES[paletteId] ?? CAT_PALETTES.default;
  const list = reverse ? [...colors].reverse() : colors;
  const step = list.length > 1 ? 100 / (list.length - 1) : 100;
  const parts = list.map((c, i) => `${c} ${i * step}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
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

const RDYLGN = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#a50026", "#fdae61", "#ffffbf", "#a6d96a", "#006837"]
);

const SPECTRAL = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#9e0142", "#f46d43", "#ffffbf", "#66c2a5", "#5e4fa2"]
);

const PIYG = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#8e0152", "#de77ae", "#f7f7f7", "#7fbc41", "#276419"]
);

const PUOR = stopsFromHex(
  [0, 0.25, 0.5, 0.75, 1],
  ["#7f3b08", "#fdb863", "#f7f7f7", "#74add1", "#2d004b"]
);

const RDBU_R = stopsFromHex(
  [0, 0.5, 1],
  ["#3b4cc0", "#ffffff", "#b4042e"]
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

const YLGNBU = stopsFromHex(
  [0, 0.5, 1],
  ["#081d58", "#41b6c4", "#edf8fb"]
);

const ORRD = stopsFromHex(
  [0, 0.5, 1],
  ["#7f0000", "#fcae91", "#fff5f0"]
);

const REDS = stopsFromHex(
  [0, 0.5, 1],
  ["#67000d", "#fb6a4a", "#fff5f0"]
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
  RdBu_r: RDBU_R,
  BrBG: BRBG,
  RdYlBu: RDYLBU,
  RdYlGn: RDYLGN,
  Spectral: SPECTRAL,
  PiYG: PIYG,
  PuOr: PUOR,
  Blues: BLUES,
  Greens: GREENS,
  Oranges: ORANGES,
  Purples: PURPLES,
  YlOrRd: YLORRD,
  YlGnBu: YLGNBU,
  OrRd: ORRD,
  Reds: REDS,
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
  RdBu_r: "RdBu_r",
  BrBG: "BrBG",
  RdYlBu: "RdYlBu",
  RdYlGn: "RdYlGn",
  Spectral: "Spectral",
  PiYG: "PiYG",
  PuOr: "PuOr",
  Blues: "Blues",
  Greens: "Greens",
  Oranges: "Oranges",
  Purples: "Purples",
  YlOrRd: "YlOrRd",
  YlGnBu: "YlGnBu",
  OrRd: "OrRd",
  Reds: "Reds",
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

// --- Co-expression palette (2D: Gene1 vs Gene2) ---
/** Four corner colors: (0,0)=both low, (1,0)=Gene1 high, (0,1)=Gene2 high, (1,1)=both high. Hex strings. */
export type CoexpressionPalette = {
  c00: string;
  c10: string;
  c01: string;
  c11: string;
};

/** Default: white (none), blue (Gene1), orange (Gene2), yellow (co-expression). */
export const DEFAULT_COEXPRESSION_PALETTE: CoexpressionPalette = {
  c00: "#ffffff",
  c10: "#2563eb",
  c01: "#ea580c",
  c11: "#eab308",
};

function hexToRgbNorm(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b];
}

/**
 * Bilinear interpolation for co-expression: (v1, v2) in [0,1]^2 -> RGB hex.
 * v1 = normalized Gene1 expression, v2 = normalized Gene2 expression.
 */
export function coexpressionToHex(
  v1: number,
  v2: number,
  palette: CoexpressionPalette
): string {
  const v1c = Math.max(0, Math.min(1, Number.isFinite(v1) ? v1 : 0));
  const v2c = Math.max(0, Math.min(1, Number.isFinite(v2) ? v2 : 0));
  const r00 = hexToRgbNorm(palette.c00);
  const r10 = hexToRgbNorm(palette.c10);
  const r01 = hexToRgbNorm(palette.c01);
  const r11 = hexToRgbNorm(palette.c11);
  const w00 = (1 - v1c) * (1 - v2c);
  const w10 = v1c * (1 - v2c);
  const w01 = (1 - v1c) * v2c;
  const w11 = v1c * v2c;
  const r = Math.round(255 * (w00 * r00[0] + w10 * r10[0] + w01 * r01[0] + w11 * r11[0]));
  const g = Math.round(255 * (w00 * r00[1] + w10 * r10[1] + w01 * r01[1] + w11 * r11[1]));
  const b = Math.round(255 * (w00 * r00[2] + w10 * r10[2] + w01 * r01[2] + w11 * r11[2]));
  return `#${Math.max(0, Math.min(255, r)).toString(16).padStart(2, "0")}${Math.max(0, Math.min(255, g)).toString(16).padStart(2, "0")}${Math.max(0, Math.min(255, b)).toString(16).padStart(2, "0")}`;
}
