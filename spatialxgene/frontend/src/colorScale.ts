/**
 * Color scales for spatial scatter: continuous (gene) and categorical (annotation).
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

// Continuous: map value in [vmin, vmax] to RGB (viridis-like gradient)
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Simple blue -> white -> red (or use a proper viridis)
const STOPS: [number, number, number, number][] = [
  [0, 0.2, 0.4, 0.8],   // dark blue
  [0.25, 0.3, 0.6, 0.9],
  [0.5, 0.9, 0.9, 0.9], // white
  [0.75, 0.9, 0.5, 0.3],
  [1, 0.8, 0.2, 0.2],   // red
];

export function continuousToRgb(value: number, vmin: number, vmax: number): [number, number, number] {
  if (vmax <= vmin || !Number.isFinite(value)) {
    const [r, g, b] = STOPS[0].slice(1);
    return [r * 255, g * 255, b * 255];
  }
  const t = Math.max(0, Math.min(1, (value - vmin) / (vmax - vmin)));
  let i = 0;
  while (i < STOPS.length - 1 && STOPS[i + 1][0] < t) i++;
  const [p0, r0, g0, b0] = STOPS[i];
  const [p1, r1, g1, b1] = STOPS[i + 1];
  const s = (t - p0) / (p1 - p0);
  return [
    Math.round(lerp(r0, r1, s) * 255),
    Math.round(lerp(g0, g1, s) * 255),
    Math.round(lerp(b0, b1, s) * 255),
  ];
}
