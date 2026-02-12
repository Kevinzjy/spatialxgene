/**
 * Compute percentile of a numeric array. p in [0, 100].
 * Uses a histogram-based approximation (O(n), no recursion / sort) so it
 * remains robust for very large arrays (hundreds of thousands of points)
 * without risking "Maximum call stack size exceeded" in some JS engines.
 */
export function percentile(arr: number[], p: number): number {
  // Collect finite values once, and track min/max along the way so we can
  // cheaply detect the "all values identical" case.
  const finite: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    finite.push(v);
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (finite.length === 0) return 0;
  if (finite.length === 1 || min === max) return finite[0];

  // Clamp p to [0, 100]
  const pp = Math.max(0, Math.min(100, p));
  if (!Number.isFinite(pp)) return finite[0];

  // Histogram-based approximation: map values into a fixed number of bins
  // between min and max, then walk cumulative counts to find the percentile.
  const BINS = 512;
  const counts = new Array<number>(BINS).fill(0);
  const range = max - min || 1;

  for (let i = 0; i < finite.length; i++) {
    const v = finite[i];
    let idx = Math.floor(((v - min) / range) * (BINS - 1));
    if (idx < 0) idx = 0;
    if (idx >= BINS) idx = BINS - 1;
    counts[idx]++;
  }

  const total = finite.length;
  const target = (pp / 100) * (total - 1);
  let cumulative = 0;
  let binIndex = 0;
  for (; binIndex < BINS; binIndex++) {
    const c = counts[binIndex];
    if (c === 0) continue;
    if (cumulative + c > target) {
      // Interpolate within this bin.
      const offsetInBin = target - cumulative;
      const fraction = offsetInBin / c;
      const binStart = min + (range * binIndex) / BINS;
      const binEnd = min + (range * (binIndex + 1)) / BINS;
      return binStart + (binEnd - binStart) * fraction;
    }
    cumulative += c;
  }

  // Fallback (shouldn't normally hit): return max.
  return max;
}
