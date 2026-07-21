export type EmbeddingMode = "spatial" | "umap" | "pca" | "tsne";

export type PlotBounds = { xMin: number; xMax: number; yMin: number; yMax: number };

// Keep embedding points conservative by default: the earlier trial default size is now reached at 200%.
const EMBEDDING_SPACING_FACTOR = 0.875;
const EMBEDDING_MIN_RANGE_FRACTION = 0.003;
const EMBEDDING_MAX_RANGE_FRACTION = 0.06;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Fallback spacing from bounding box (used when we can't compute nearest-neighbor).
 */
export function gridSpacingFallback(bounds: PlotBounds, n: number): number {
  const dataW = bounds.xMax - bounds.xMin || 1;
  const dataH = bounds.yMax - bounds.yMin || 1;
  const area = dataW * dataH;
  if (n <= 0) return Math.sqrt(area);
  return Math.sqrt(area / n);
}

/**
 * Estimate nearest-neighbor spacing from actual coordinates so that 100% spot size
 * (diameter = this spacing) is tangent across Visium/spatial coordinates.
 */
export function estimateNearestNeighborSpacing(x: number[], y: number[], bounds: PlotBounds, n: number): number {
  const nPts = Math.min(x.length, y.length, n);
  if (nPts < 2) return gridSpacingFallback(bounds, nPts);
  const dataW = bounds.xMax - bounds.xMin || 1;
  const dataH = bounds.yMax - bounds.yMin || 1;
  const area = dataW * dataH;
  const fallback = Math.sqrt(area / nPts);
  const cellSize = Math.max(fallback * 0.5, 1e-6);
  const nx = Math.max(1, Math.ceil(dataW / cellSize));
  const ny = Math.max(1, Math.ceil(dataH / cellSize));
  type Cell = number[];
  const grid: Cell[] = [];
  for (let g = 0; g < nx * ny; g++) grid.push([]);
  const getCell = (xi: number, yi: number) => {
    const cx = Math.min(nx - 1, Math.max(0, Math.floor((xi - bounds.xMin) / cellSize)));
    const cy = Math.min(ny - 1, Math.max(0, Math.floor((yi - bounds.yMin) / cellSize)));
    return cy * nx + cx;
  };
  for (let i = 0; i < nPts; i++) {
    const c = getCell(x[i], y[i]);
    grid[c].push(i);
  }
  const sampleStep = Math.max(1, Math.floor(nPts / 80));
  const minDistances: number[] = [];
  for (let i = 0; i < nPts; i += sampleStep) {
    const xi = x[i];
    const yi = y[i];
    const cx = Math.min(nx - 1, Math.max(0, Math.floor((xi - bounds.xMin) / cellSize)));
    const cy = Math.min(ny - 1, Math.max(0, Math.floor((yi - bounds.yMin) / cellSize)));
    let minD2 = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gx >= nx || gy < 0 || gy >= ny) continue;
        const cell = grid[gy * nx + gx];
        for (let k = 0; k < cell.length; k++) {
          const j = cell[k];
          if (i === j) continue;
          const ddx = x[j] - xi;
          const ddy = y[j] - yi;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < minD2) minD2 = d2;
        }
      }
    }
    if (Number.isFinite(minD2) && minD2 > 0) minDistances.push(Math.sqrt(minD2));
  }
  if (minDistances.length === 0) return fallback;
  minDistances.sort((a, b) => a - b);
  const p10 = Math.min(minDistances.length - 1, Math.floor(minDistances.length * 0.1));
  return minDistances[p10] ?? fallback;
}

/**
 * Low-dimensional embeddings are not regular grids, so nearest-neighbor spacing
 * often makes points too small. Normalize by the larger axis span and point count.
 */
export function estimateEmbeddingSpacing(bounds: PlotBounds, n: number): number {
  const nPts = Math.max(1, n);
  const dataW = Math.abs(bounds.xMax - bounds.xMin);
  const dataH = Math.abs(bounds.yMax - bounds.yMin);
  const maxRange = Math.max(dataW, dataH, 1e-6);
  const raw = (maxRange / Math.sqrt(nPts)) * EMBEDDING_SPACING_FACTOR;
  return clamp(raw, maxRange * EMBEDDING_MIN_RANGE_FRACTION, maxRange * EMBEDDING_MAX_RANGE_FRACTION);
}

export function estimateSpotSpacingData(
  x: number[],
  y: number[],
  bounds: PlotBounds,
  embeddingMode: EmbeddingMode,
  n = Math.min(x.length, y.length)
): number {
  if (embeddingMode === "spatial") return estimateNearestNeighborSpacing(x, y, bounds, n);
  return estimateEmbeddingSpacing(bounds, n);
}
