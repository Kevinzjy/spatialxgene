/**
 * Compute percentile of a numeric array. p in [0, 100].
 * Uses linear interpolation between adjacent indices.
 */
export function percentile(arr: number[], p: number): number {
  const finite = arr.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  if (finite.length === 1) return finite[0];
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  const t = (p / 100) * (n - 1);
  const i0 = Math.max(0, Math.floor(t));
  const i1 = Math.min(n - 1, i0 + 1);
  if (i0 === i1) return sorted[i0];
  const w = t - i0;
  return sorted[i0] * (1 - w) + sorted[i1] * w;
}
