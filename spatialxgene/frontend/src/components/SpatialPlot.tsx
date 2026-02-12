import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCategoricalColors, continuousToRgb } from "../colorScale";

export type ColorMode = "categorical" | "continuous" | "none";

const PAD = 20;

/**
 * Grid-based spacing: n points in [xMin..xMax] x [yMin..yMax].
 * If points form a regular grid, cell area = (dataW*dataH)/n, so step ≈ sqrt(area/n).
 * Use this so point radius matches spatial layout (no sampling bias).
 */
function gridSpacing(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  n: number
): number {
  const dataW = bounds.xMax - bounds.xMin || 1;
  const dataH = bounds.yMax - bounds.yMin || 1;
  const area = dataW * dataH;
  if (n <= 0) return Math.sqrt(area);
  return Math.sqrt(area / n);
}

/** Spot size scale relative to default (spacing * 0.42). 1 = current default, 0.8 = 80% (sidebar default). */
export const SPOT_SIZE_DEFAULT_SCALE = 0.8;

export type SpatialPlotProps = {
  x: number[];
  y: number[];
  colorBy: (string | number)[]; // string for categorical, number for expression
  colorMode: ColorMode;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** Scale for point radius relative to grid-based default (0.42 * spacing). Default 0.8 = 80%. */
  spotSizeScale?: number;
  /** Spot opacity 0–1 (default 1). */
  spotOpacity?: number;
  /** Override vmin/vmax for continuous (gene) color scale; e.g. from percentile range. */
  colorMin?: number;
  colorMax?: number;
  /** Continuous color palette id (e.g. vlag, viridis). Used when colorMode is continuous. */
  continuousPalette?: string;
  /** Reverse palette direction (e.g. vlag_r). Used when colorMode is continuous. */
  continuousPaletteReverse?: boolean;
  /** URL for background image (e.g. tissue). Null = no image. */
  backgroundImageUrl?: string | null;
  /** Bounds in data space where the image should be drawn (from scale_factor + width/height). Omit to stretch to plot bounds. */
  backgroundImageBounds?: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
  title?: string;
};

export function SpatialPlot({ x, y, colorBy, colorMode, bounds, spotSizeScale = SPOT_SIZE_DEFAULT_SCALE, spotOpacity = 1, colorMin, colorMax, continuousPalette, continuousPaletteReverse, backgroundImageUrl, backgroundImageBounds, title }: SpatialPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!backgroundImageUrl) {
      setBackgroundImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setBackgroundImage(img);
    img.onerror = () => setBackgroundImage(null);
    img.src = backgroundImageUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
  }, [backgroundImageUrl]);

  const n = x.length;
  if (y.length !== n) return null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = rect.width;
    const H = rect.height;
    if (W < 2 * PAD || H < 2 * PAD) return;
    const { scale, tx, ty } = view;
    const dataW = bounds.xMax - bounds.xMin || 1;
    const dataH = bounds.yMax - bounds.yMin || 1;
    const sx = (W - 2 * PAD) / dataW;
    const sy = (H - 2 * PAD) / dataH;
    const sBase = Math.max(1e-6, Math.min(sx, sy));
    const s = sBase * scale;
    const centerX = (bounds.xMin + bounds.xMax) / 2;
    const centerY = (bounds.yMin + bounds.yMax) / 2;
    const baseOx = PAD + (W - 2 * PAD) / 2;
    const baseOy = PAD + (H - 2 * PAD) / 2;
    const ox = baseOx + tx - centerX * s;
    const oy = baseOy + ty - centerY * s;

    // Draw in DATA space: transform scales both position and circle size -> points scale with zoom
    ctx.save();
    ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr);

    if (backgroundImage && backgroundImage.complete && backgroundImage.naturalWidth > 0) {
      const imgBounds = backgroundImageBounds ?? bounds;
      const imgW = imgBounds.xMax - imgBounds.xMin || 1;
      const imgH = imgBounds.yMax - imgBounds.yMin || 1;
      ctx.drawImage(backgroundImage, imgBounds.xMin, imgBounds.yMin, imgW, imgH);
    }

    const spacing = gridSpacing(bounds, n);
    // radius = base (0.42 * spacing) * user scale; clamp to avoid invisible or overlapping points.
    // Use a spacing-relative minimum so that for dense embeddings (e.g. UMAP) the slider still has effect; absolute 0.3 only for sparse/spatial grids.
    const sizeScale = Math.max(0.15, Math.min(1.5, spotSizeScale));
    const radiusData = Math.max(spacing * 0.42 * sizeScale, Math.min(0.3, spacing * 0.08));

    let catMap: Map<string, string> | null = null;
    let vmin = 0, vmax = 1;
    if (colorMode === "categorical") {
      catMap = getCategoricalColors(colorBy as string[]);
    } else if (colorMode === "continuous") {
      if (colorMin !== undefined && colorMax !== undefined && colorMax > colorMin) {
        vmin = colorMin;
        vmax = colorMax;
      } else {
        const nums = (colorBy as number[]).filter((v) => Number.isFinite(v));
        vmin = Math.min(...nums);
        vmax = Math.max(...nums);
        if (vmax <= vmin) vmax = vmin + 1;
      }
    }

    const margin = radiusData + 2;
    const dataLeft = -ox / s;
    const dataRight = (W - ox) / s;
    const dataTop = -oy / s;
    const dataBottom = (H - oy) / s;
    const clipXMin = Math.min(dataLeft, dataRight) - margin;
    const clipXMax = Math.max(dataLeft, dataRight) + margin;
    const clipYMin = Math.min(dataTop, dataBottom) - margin;
    const clipYMax = Math.max(dataTop, dataBottom) + margin;

    const alpha = Math.max(0, Math.min(1, spotOpacity));
    ctx.globalAlpha = alpha;

    // Level-of-detail: for very large point sets, subsample when zoomed out so
    // we keep a roughly constant upper bound on the number of drawn points.
    const MAX_DRAW_POINTS = 120_000;
    let step = 1;
    if (n > MAX_DRAW_POINTS) {
      const base = n / MAX_DRAW_POINTS;
      // When zoomed out (scale < 1), we can afford to skip more points. Clamp
      // scale to avoid extreme factors.
      const zoomFactor = 1 / Math.max(0.5, Math.min(2, scale));
      step = Math.max(1, Math.floor(base * zoomFactor));
    }

    // Cache categorical colors as RGB triplets to avoid repeated hex parsing.
    const catRgbCache: Map<string, [number, number, number]> | null =
      colorMode === "categorical" && catMap ? new Map() : null;

    const size = radiusData * 2;
    const screenRadius = radiusData * s * dpr;
    // 远景（小半径或有降采样）用方块，近景且全量时继续用圆，保证细节观感。
    const useSquares = step > 1 || screenRadius <= 2;

    for (let i = 0; i < n; i += step) {
      const px = x[i];
      const py = y[i];
      if (px < clipXMin || px > clipXMax || py < clipYMin || py > clipYMax) continue;
      let r: number, g: number, b: number;
      if (colorMode === "none") {
        r = g = b = 136; // neutral gray when no annotation/gene selected
      } else if (colorMode === "categorical" && catMap) {
        const key = String(colorBy[i] ?? "");
        let rgb: [number, number, number] | undefined = catRgbCache?.get(key);
        if (!rgb) {
          const hex = catMap.get(key) ?? "#888888";
          const m = hex.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
          const rr = m ? parseInt(m[1], 16) : 128;
          const gg = m ? parseInt(m[2], 16) : 128;
          const bb = m ? parseInt(m[3], 16) : 128;
          rgb = [rr, gg, bb];
          catRgbCache?.set(key, rgb);
        }
        [r, g, b] = rgb;
      } else if (colorMode === "continuous") {
        const v = (colorBy[i] as number) ?? NaN;
        [r, g, b] = continuousToRgb(v, vmin, vmax, continuousPalette, continuousPaletteReverse);
      } else {
        r = g = b = 136;
      }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      if (useSquares) {
        // Use small rectangles instead of arcs for better performance on large point sets / when zoomed out.
        ctx.fillRect(px - radiusData, py - radiusData, size, size);
      } else {
        // When zoomed in and drawing all points, use circles for better visual quality.
        ctx.beginPath();
        ctx.arc(px, py, radiusData, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }, [x, y, colorBy, colorMode, bounds, n, view, spotSizeScale, spotOpacity, colorMin, colorMax, continuousPalette, continuousPaletteReverse, backgroundImage, backgroundImageBounds]);

  useEffect(() => draw(), [draw]);

  // Redraw when container size changes (e.g. window resize or layout change)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => setView((v) => ({ ...v })));
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Wheel with passive: false so preventDefault() works (stops page scroll when zooming)
  // Zoom around the mouse cursor: keep the data point under the cursor fixed in screen space.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setView((v) => {
        const newScale = Math.max(0.1, Math.min(50, v.scale * factor));

        const W = rect.width;
        const H = rect.height;
        if (W < 2 * PAD || H < 2 * PAD) {
          return { ...v, scale: newScale };
        }

        const dataW = bounds.xMax - bounds.xMin || 1;
        const dataH = bounds.yMax - bounds.yMin || 1;
        const sx = (W - 2 * PAD) / dataW;
        const sy = (H - 2 * PAD) / dataH;
        const sBase = Math.max(1e-6, Math.min(sx, sy));
        const s = sBase * v.scale;
        const sNew = sBase * newScale;
        const centerX = (bounds.xMin + bounds.xMax) / 2;
        const centerY = (bounds.yMin + bounds.yMax) / 2;
        const baseOx = PAD + (W - 2 * PAD) / 2;
        const baseOy = PAD + (H - 2 * PAD) / 2;

        const ox = baseOx + v.tx - centerX * s;
        const oy = baseOy + v.ty - centerY * s;

        // Data coordinates under cursor before zoom.
        const px = (cx - ox) / s;
        const py = (cy - oy) / s;

        // New translation so that (px, py) stays under the same screen position.
        const txNew = cx - (px * sNew + baseOx - centerX * sNew);
        const tyNew = cy - (py * sNew + baseOy - centerY * sNew);

        return { scale: newScale, tx: txNew, ty: tyNew };
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [bounds]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) setDrag({ x: e.clientX, y: e.clientY });
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (drag) {
        setView((v) => ({
          ...v,
          tx: v.tx + (e.clientX - drag.x),
          ty: v.ty + (e.clientY - drag.y),
        }));
        setDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [drag]
  );

  const onMouseUp = useCallback(() => setDrag(null), []);
  const onMouseLeave = useCallback(() => setDrag(null), []);

  const handleResetView = useCallback(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
  }, []);

  const handleZoomButton = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W < 2 * PAD || H < 2 * PAD) return;

      const cx = W / 2;
      const cy = H / 2;

      setView((v) => {
        const newScale = Math.max(0.1, Math.min(50, v.scale * factor));
        const dataW = bounds.xMax - bounds.xMin || 1;
        const dataH = bounds.yMax - bounds.yMin || 1;
        const sx = (W - 2 * PAD) / dataW;
        const sy = (H - 2 * PAD) / dataH;
        const sBase = Math.max(1e-6, Math.min(sx, sy));
        const s = sBase * v.scale;
        const sNew = sBase * newScale;
        const centerX = (bounds.xMin + bounds.xMax) / 2;
        const centerY = (bounds.yMin + bounds.yMax) / 2;
        const baseOx = PAD + (W - 2 * PAD) / 2;
        const baseOy = PAD + (H - 2 * PAD) / 2;

        const ox = baseOx + v.tx - centerX * s;
        const oy = baseOy + v.ty - centerY * s;

        const px = (cx - ox) / s;
        const py = (cy - oy) / s;

        const txNew = cx - (px * sNew + baseOx - centerX * sNew);
        const tyNew = cy - (py * sNew + baseOy - centerY * sNew);

        return { scale: newScale, tx: txNew, ty: tyNew };
      });
    },
    [bounds]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {(title || true) && (
        <div
          style={{
            padding: "6px 12px",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>{title}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => handleZoomButton(1 / 1.2)}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #0f3460",
                background: "#1a1a2e",
                color: "#eee",
                fontSize: 12,
                cursor: "pointer",
              }}
              title="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => handleZoomButton(1.2)}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #0f3460",
                background: "#1a1a2e",
                color: "#eee",
                fontSize: 12,
                cursor: "pointer",
              }}
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleResetView}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #0f3460",
                background: "#1a1a2e",
                color: "#eee",
                fontSize: 12,
                cursor: "pointer",
              }}
              title="Reset view"
            >
              Reset
            </button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 200,
          overflow: "hidden",
          background: "#1a1a2e",
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: drag ? "grabbing" : "grab" }}
        />
      </div>
    </div>
  );
}
